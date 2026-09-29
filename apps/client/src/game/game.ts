import * as THREE from "three";
import { TICK_DT } from "@shutter/shared/constants";
import { type SpawnPoint, findSpawnPoints } from "@shutter/shared/map";
import { PhysicsWorld } from "@shutter/shared/physics";
import {
  PLAYER,
  PlayerBody,
  SWITCH_TIME,
  WEAPONS,
  type WeaponEvent,
  clonePlayerState,
  createPlayerState,
  createWeaponState,
  currentSpread,
  eyeHeight,
  resolveShot,
  stepWeapons,
} from "@shutter/shared/sim";
import { viewDirection } from "@shutter/shared/math";
import { Sfx } from "../audio/sfx.ts";
import type { SceneContext } from "../render/scene.ts";
import { Hud } from "../ui/hud.ts";
import { DummyManager } from "./dummies.ts";
import { Effects } from "./effects.ts";
import { InputManager } from "./input.ts";
import { ViewModel } from "./viewmodel.ts";

/** Llavor de la dispersió del jugador local (al multijugador vindrà del servidor). */
const PLAYER_SEED = 1;
/** Plaça entre A5, B5 i B6: aquí comença la partida d'entrenament. */
const START_AREA = { x: -85, z: 5 };
const DUMMY_COUNT = 10;
const RECOIL_RECOVERY = 0.7; // rad/s
/** A partir d'aquest retrocés acumulat, els trets nous pugen molt menys la mira (ràfega controlable). */
const RECOIL_SOFT_CAP = 0.07;

const distXZ = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);
const yawTowards = (from: { x: number; z: number }, to: { x: number; z: number }): number => Math.atan2(-(to.x - from.x), -(to.z - from.z));

/**
 * Mode entrenament (fase 2): el jugador es mou pel campus amb la simulació compartida i dispara a dianes.
 * `?nolock=1` permet jugar amb el teclat sense capturar el ratolí (proves automàtiques).
 */
export async function startGame(ctx: SceneContext, hudRoot: HTMLElement): Promise<void> {
  const { renderer, scene, camera, env } = ctx;
  const { map, terrain } = ctx.loaded;
  const params = new URLSearchParams(location.search);
  const physics = await PhysicsWorld.create(map, terrain);

  const candidates = findSpawnPoints(map, terrain, { count: 400, seed: 3, minSpacing: 4 });
  candidates.sort((a, b) => distXZ(a, START_AREA) - distXZ(b, START_AREA));
  const spawn: SpawnPoint = candidates[0];
  // Dianes només on es veuen des del punt d'inici (cap edifici, arbre ni desnivell pel mig).
  const eye = { x: spawn.x, y: spawn.y + PLAYER.standEye, z: spawn.z };
  const visible = (p: SpawnPoint): boolean => {
    const to = { x: p.x - eye.x, y: p.y + 1.1 - eye.y, z: p.z - eye.z };
    const len = Math.hypot(to.x, to.y, to.z);
    return !physics.raycast(eye, { x: to.x / len, y: to.y / len, z: to.z / len }, len);
  };
  const dummyPoints: SpawnPoint[] = [];
  for (const p of candidates) {
    if (dummyPoints.length >= DUMMY_COUNT) break;
    const d = distXZ(p, spawn);
    if (d > 9 && d < 80 && visible(p) && dummyPoints.every((q) => distXZ(q, p) > 6)) dummyPoints.push(p);
  }
  const target = dummyPoints.reduce((acc, p) => ({ x: acc.x + p.x / dummyPoints.length, z: acc.z + p.z / dummyPoints.length }), { x: 0, z: 0 });
  const startYaw = dummyPoints.length ? yawTowards(spawn, target) : spawn.yaw;

  const input = new InputManager(renderer.domElement);
  input.allowUnlocked = params.has("nolock");
  input.yaw = startYaw;
  const body = new PlayerBody(physics);
  const state = createPlayerState(spawn.x, spawn.y, spawn.z, startYaw);
  const prev = clonePlayerState(state);
  const weapons = createWeaponState(1);

  const hud = new Hud(hudRoot);
  const viewmodel = new ViewModel();
  const effects = new Effects();
  const dummies = new DummyManager(physics, dummyPoints, spawn);
  const sfx = new Sfx();
  const muzzleLight = new THREE.PointLight(0xffc873, 0, 9, 2);
  scene.add(effects.group, dummies.group, muzzleLight);
  ctx.onResize((w, h) => viewmodel.setAspect(w / h));

  let seq = 0;
  let accumulator = 0;
  let kills = 0;
  let shotsFired = 0;
  let shotsHit = 0;
  let stepDistance = 0;
  let recoilDebt = 0;
  let sinceShot = 1;
  let muzzleTime = 0;
  let lastYaw = input.yaw;
  let lastPitch = input.pitch;
  let hudKey = "";

  const running = (): boolean => input.locked || input.allowUnlocked;
  hud.showOverlay("Shutter Campus Nord", "Clica per jugar · entrenament");
  hud.onOverlayClick(() => {
    sfx.resume();
    input.lock();
  });
  input.onLockChange((locked) => (locked ? hud.hideOverlay() : hud.showOverlay("Pausa", "Clica per continuar")));
  if (input.allowUnlocked) hud.hideOverlay();

  const v3 = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);

  /** Posició aproximada de la boca del canó al món (per a les traçadores i el flaix). */
  function muzzleWorld(): THREE.Vector3 {
    const f = viewDirection(state.yaw, state.pitch);
    const right = new THREE.Vector3(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
    return new THREE.Vector3(state.x, state.y + eyeHeight(state), state.z)
      .addScaledVector(v3(f), 0.55)
      .addScaledVector(right, 0.14)
      .add(new THREE.Vector3(0, -0.12, 0));
  }

  function onWeaponEvent(e: WeaponEvent): void {
    switch (e.type) {
      case "shot": {
        const spec = WEAPONS[e.weapon];
        sfx.shot(e.weapon);
        viewmodel.onShot(e.weapon);
        muzzleTime = 0.05;
        // Retrocés: la mira puja i després es recupera sola.
        const kick = spec.recoil * (0.8 + Math.random() * 0.4) * (recoilDebt > RECOIL_SOFT_CAP ? 0.2 : 1);
        input.pitch = Math.min(PLAYER.maxPitch, input.pitch + kick);
        input.yaw += (Math.random() - 0.5) * kick * 0.5;
        recoilDebt += kick;
        sinceShot = 0;

        const targets = dummies.targets();
        const muzzle = muzzleWorld();
        muzzleLight.position.copy(muzzle);
        let hit = false;
        let head = false;
        let killed = false;
        for (const dir of e.directions) {
          const res = resolveShot(physics, spec, e.origin, dir, targets);
          effects.tracer(muzzle, v3(res.end));
          if (res.target) {
            hit = true;
            head ||= res.target.part === "head";
            effects.impact(v3(res.end), v3({ x: -dir.x, y: -dir.y, z: -dir.z }), "blood", 5);
            if (dummies.damage(res.target.id, res.target.damage, res.target.part)) killed = true;
          } else if (res.worldHit) {
            effects.impact(v3(res.worldHit.point), v3(res.worldHit.normal), res.worldHit.surface);
          }
        }
        shotsFired++;
        if (hit) shotsHit++;
        if (killed) {
          kills++;
          hud.showHit("kill");
          sfx.kill();
          hud.pushFeed(head ? "Diana abatuda · al cap!" : "Diana abatuda");
        } else if (hit) {
          hud.showHit(head ? "head" : "body");
          sfx.hit(head);
        }
        break;
      }
      case "dry":
        sfx.dry();
        break;
      case "reloadStart":
        sfx.reload();
        break;
      case "reloadEnd":
      case "switch":
        break;
    }
  }

  function tick(): void {
    Object.assign(prev, state);
    const inp = input.sample(seq++);
    const move = body.step(state, inp, TICK_DT);
    if (move.landedSpeed > 3) sfx.land(move.landedSpeed);
    if (state.onGround) {
      stepDistance += Math.hypot(state.x - prev.x, state.z - prev.z);
      if (stepDistance > 2.3) {
        stepDistance = 0;
        sfx.step();
      }
    }
    for (const e of stepWeapons(weapons, state, inp, TICK_DT, PLAYER_SEED)) onWeaponEvent(e);
    dummies.step(TICK_DT);
    // Si per algun motiu cau sota el terreny, torna al punt d'inici.
    if (state.y < terrain.heightAt(state.x, state.z) - 8) {
      Object.assign(state, createPlayerState(spawn.x, spawn.y, spawn.z, input.yaw));
      Object.assign(prev, state);
    }
  }

  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (running()) {
      accumulator += dt;
      while (accumulator >= TICK_DT) {
        tick();
        accumulator -= TICK_DT;
      }
    }
    const alpha = accumulator / TICK_DT;

    sinceShot += dt;
    if (recoilDebt > 0) {
      // Es recupera poc a poc mentre es dispara i de pressa quan es deixa de disparar.
      const r = Math.min(recoilDebt, dt * RECOIL_RECOVERY * (sinceShot > 0.12 ? 1 : 0.25));
      input.pitch -= r;
      recoilDebt -= r;
    }

    // Càmera: posició interpolada entre ticks, mirada sempre la més recent.
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    const crouch = lerp(prev.crouchAmount, state.crouchAmount);
    const eye = PLAYER.standEye + (PLAYER.crouchEye - PLAYER.standEye) * crouch;
    camera.position.set(lerp(prev.x, state.x), lerp(prev.y, state.y) + eye, lerp(prev.z, state.z));
    camera.rotation.set(input.pitch, input.yaw, 0, "YXZ");

    const spec = WEAPONS[weapons.current];
    const speed = Math.hypot(state.vx, state.vz);
    viewmodel.addLook(input.yaw - lastYaw, input.pitch - lastPitch);
    lastYaw = input.yaw;
    lastPitch = input.pitch;
    viewmodel.update(dt, {
      weapon: weapons.current,
      speed,
      onGround: state.onGround,
      sprinting: state.onGround && speed > PLAYER.walkSpeed + 0.4,
      reload: weapons.reload > 0 ? 1 - weapons.reload / spec.reloadTime : -1,
      switching: weapons.switching / SWITCH_TIME,
    });
    muzzleTime = Math.max(0, muzzleTime - dt);
    muzzleLight.intensity = muzzleTime > 0 ? 40 : 0;
    effects.update(dt);
    dummies.render(alpha, dt);
    env.update(camera.position);

    // HUD: només es toca el DOM quan canvia alguna cosa.
    const spreadPx = (Math.tan(currentSpread(spec, state)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * (window.innerHeight / 2);
    const accuracy = shotsFired ? Math.round((shotsHit / shotsFired) * 100) : 0;
    const key = `${weapons.current}|${weapons.ammo[weapons.current]}|${weapons.reserve[weapons.current]}|${weapons.reload > 0}|${kills}|${accuracy}|${Math.round(spreadPx)}`;
    if (key !== hudKey) {
      hudKey = key;
      hud.setSpread(spreadPx);
      hud.setWeapon(spec.name, weapons.ammo[weapons.current], weapons.reserve[weapons.current], weapons.reload > 0);
      hud.setHealth(100);
      hud.setScore(`Entrenament · dianes abatudes: ${kills} · precisió ${accuracy}%`);
    }
    hud.update(dt);

    renderer.autoClear = false;
    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(viewmodel.scene, viewmodel.camera);
  });

  if (import.meta.env.DEV) {
    // Accés de depuració des de la consola del navegador.
    Object.assign(window, { __shutter: { state, weapons, input, physics, dummies } });
  }
}
