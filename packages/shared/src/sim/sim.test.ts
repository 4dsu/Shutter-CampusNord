import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { type MapData, type SpawnPoint, TerrainField, centroid, findSpawnPoints, pointInRing, distanceToSegment } from "../map/index.ts";
import { viewDirection } from "../math.ts";
import { PhysicsWorld } from "../physics/world.ts";
import { resolveShot } from "./combat.ts";
import { hitboxOf, rayCapsule, raySphere } from "./hitbox.ts";
import { Buttons, type PlayerInput } from "./input.ts";
import { PLAYER, PlayerBody, type PlayerState, createPlayerState } from "./player.ts";
import { mulberry32 } from "./random.ts";
import { WEAPONS, createWeaponState, eyePosition, shotDirections, stepWeapons } from "./weapons.ts";

const DT = 1 / 60;
const map = JSON.parse(readFileSync(new URL("../../../../assets/maps/campus-nord.json", import.meta.url), "utf8")) as MapData;
const terrain = TerrainField.fromData(map.terrain);

let physics: PhysicsWorld;
let spawns: SpawnPoint[];

beforeAll(async () => {
  physics = await PhysicsWorld.create(map, terrain);
  spawns = findSpawnPoints(map, terrain, { count: 12, seed: 7 });
});

const input = (buttons: number, yaw = 0, pitch = 0, weapon = 1, seq = 0): PlayerInput => ({ seq, buttons, yaw, pitch, weapon });

function simulate(body: PlayerBody, s: PlayerState, ticks: number, make: (tick: number) => PlayerInput): void {
  for (let i = 0; i < ticks; i++) body.step(s, make(i), DT);
}

describe("punts d'aparició", () => {
  it("troba punts dins del campus i fora dels edificis", () => {
    expect(spawns.length).toBe(12);
    for (const p of spawns) {
      expect(pointInRing([p.x, p.z], map.playArea)).toBe(true);
      expect(map.buildings.some((b) => pointInRing([p.x, p.z], b.footprint))).toBe(false);
    }
  });

  it("és determinista", () => {
    expect(findSpawnPoints(map, terrain, { count: 12, seed: 7 })).toEqual(spawns);
  });
});

describe("moviment del jugador sobre el mapa real", () => {
  it("cau i es queda dret sobre el terreny", () => {
    const body = new PlayerBody(physics);
    const sp = spawns[0];
    const s = createPlayerState(sp.x, sp.y + 3, sp.z);
    simulate(body, s, 120, () => input(0));
    expect(s.onGround).toBe(true);
    expect(Math.abs(s.y - terrain.heightAt(s.x, s.z))).toBeLessThan(0.12);
    body.dispose();
  });

  it("camina a la velocitat prevista i corre més de pressa", () => {
    const body = new PlayerBody(physics);
    const sp = spawns[1];
    const walk = createPlayerState(sp.x, sp.y, sp.z, sp.yaw);
    simulate(body, walk, 20, () => input(0, sp.yaw));
    const startX = walk.x;
    const startZ = walk.z;
    simulate(body, walk, 30, () => input(Buttons.Forward, sp.yaw));
    const walked = Math.hypot(walk.x - startX, walk.z - startZ);
    const run = createPlayerState(sp.x, sp.y, sp.z, sp.yaw);
    simulate(body, run, 20, () => input(0, sp.yaw));
    const rx = run.x;
    const rz = run.z;
    simulate(body, run, 30, () => input(Buttons.Forward | Buttons.Sprint, sp.yaw));
    const ran = Math.hypot(run.x - rx, run.z - rz);
    expect(walked).toBeGreaterThan(PLAYER.walkSpeed * 0.5 * 0.7);
    expect(walked).toBeLessThan(PLAYER.walkSpeed * 0.5 * 1.05);
    expect(ran).toBeGreaterThan(walked * 1.2);
    body.dispose();
  });

  it("salta aproximadament l'alçada prevista i torna a terra", () => {
    const body = new PlayerBody(physics);
    const sp = spawns[2];
    const s = createPlayerState(sp.x, sp.y, sp.z);
    simulate(body, s, 30, () => input(0));
    const ground = s.y;
    let top = s.y;
    simulate(body, s, 90, (t) => {
      top = Math.max(top, s.y);
      return input(t === 0 ? Buttons.Jump : 0);
    });
    const expected = (PLAYER.jumpSpeed * PLAYER.jumpSpeed) / (2 * PLAYER.gravity);
    expect(top - ground).toBeGreaterThan(expected * 0.8);
    expect(top - ground).toBeLessThan(expected * 1.15);
    expect(s.onGround).toBe(true);
    body.dispose();
  });

  it("no travessa les parets d'un edifici", () => {
    const body = new PlayerBody(physics);
    const b = map.buildings.find((x) => x.id === "B5")!;
    // Punt a 4 m de la façana més llarga, mirant cap a l'edifici.
    let best = { len: 0, i: 0 };
    b.footprint.forEach((a, i) => {
      const c = b.footprint[(i + 1) % b.footprint.length];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len > best.len) best = { len, i };
    });
    const a = b.footprint[best.i];
    const c = b.footprint[(best.i + 1) % b.footprint.length];
    const nx = (c[1] - a[1]) / best.len;
    const nz = -(c[0] - a[0]) / best.len;
    const mx = (a[0] + c[0]) / 2 + nx * 4;
    const mz = (a[1] + c[1]) / 2 + nz * 4;
    const yaw = Math.atan2(nx, nz); // mirar cap a −normal = cap a l'edifici
    const s = createPlayerState(mx, terrain.heightAt(mx, mz) + 0.5, mz, yaw);
    simulate(body, s, 240, () => input(Buttons.Forward | Buttons.Sprint, yaw));
    expect(pointInRing([s.x, s.z], b.footprint)).toBe(false);
    const d = Math.min(...b.footprint.map((p, i) => distanceToSegment([s.x, s.z], p, b.footprint[(i + 1) % b.footprint.length])));
    expect(d).toBeGreaterThan(PLAYER.radius - 0.05);
    body.dispose();
  });

  it("és determinista: la mateixa seqüència d'inputs dona exactament el mateix estat", async () => {
    const other = await PhysicsWorld.create(map, terrain);
    const run = (world: PhysicsWorld): PlayerState => {
      const body = new PlayerBody(world);
      const sp = spawns[3];
      const s = createPlayerState(sp.x, sp.y + 1, sp.z, sp.yaw);
      const rand = mulberry32(42);
      let yaw = sp.yaw;
      simulate(body, s, 600, (t) => {
        yaw += (rand() - 0.5) * 0.1;
        const buttons = Math.floor(rand() * 128) & ~Buttons.Crouch;
        return input(buttons | (t % 90 < 20 ? Buttons.Crouch : 0), yaw, (rand() - 0.5) * 0.4);
      });
      body.dispose();
      return s;
    };
    expect(run(other)).toEqual(run(physics));
    other.dispose();
  });
});

describe("armes", () => {
  const still = () => {
    const s = createPlayerState(0, 0, 0);
    s.onGround = true;
    return s;
  };

  it("el fusell automàtic respecta la cadència i gasta bales", () => {
    const w = createWeaponState(1);
    const s = still();
    let shots = 0;
    for (let t = 0; t < 60; t++) shots += stepWeapons(w, s, input(Buttons.Fire, 0, 0, 1), DT, 1).filter((e) => e.type === "shot").length;
    const expected = 1 / WEAPONS[1].fireInterval;
    expect(shots).toBeGreaterThanOrEqual(Math.floor(expected));
    expect(shots).toBeLessThanOrEqual(Math.ceil(expected) + 1);
    expect(w.ammo[1]).toBe(WEAPONS[1].magazine - shots);
  });

  it("la pistola semiautomàtica només dispara un cop per clic", () => {
    const w = createWeaponState(0);
    const s = still();
    let shots = 0;
    for (let t = 0; t < 60; t++) shots += stepWeapons(w, s, input(Buttons.Fire, 0, 0, 0), DT, 1).filter((e) => e.type === "shot").length;
    expect(shots).toBe(1);
    // Tres clics separats (es deixa anar el gallet entre clic i clic): tres trets més.
    for (let t = 0; t < 60; t++) {
      const fire = t % 20 >= 10 && t % 20 < 12 ? Buttons.Fire : 0;
      shots += stepWeapons(w, s, input(fire, 0, 0, 0), DT, 1).filter((e) => e.type === "shot").length;
    }
    expect(shots).toBe(4);
  });

  it("recarrega i passa bales de la reserva al carregador", () => {
    const w = createWeaponState(0);
    const s = still();
    w.ammo[0] = 3;
    const events = stepWeapons(w, s, input(Buttons.Reload, 0, 0, 0), DT, 1);
    expect(events.some((e) => e.type === "reloadStart")).toBe(true);
    for (let t = 0; t < 80; t++) stepWeapons(w, s, input(0, 0, 0, 0), DT, 1);
    expect(w.ammo[0]).toBe(WEAPONS[0].magazine);
    expect(w.reserve[0]).toBe(WEAPONS[0].reserve - (WEAPONS[0].magazine - 3));
  });

  it("la dispersió és determinista i l'escopeta dispara 9 perdigons", () => {
    const s = still();
    const a = shotDirections(WEAPONS[2], s, 5, 3);
    expect(a).toHaveLength(9);
    expect(shotDirections(WEAPONS[2], s, 5, 3)).toEqual(a);
    expect(shotDirections(WEAPONS[2], s, 5, 4)).not.toEqual(a);
  });
});

describe("impactes", () => {
  it("raig contra esfera i càpsula", () => {
    const o = { x: 0, y: 1, z: 0 };
    const d = { x: 0, y: 0, z: -1 };
    expect(raySphere(o, d, 0, 1, -10, 0.5)).toBeCloseTo(9.5);
    expect(raySphere(o, d, 0, 2, -10, 0.5)).toBeNull();
    expect(rayCapsule(o, d, { x: 0, y: 0, z: -5 }, { x: 0, y: 2, z: -5 }, 0.3)).toBeCloseTo(4.7);
    expect(rayCapsule(o, d, { x: 1, y: 0, z: -5 }, { x: 1, y: 2, z: -5 }, 0.3)).toBeNull();
  });

  it("un tret toca el cap o el cos d'un objectiu, però no a través d'un edifici", () => {
    const sp = spawns[4];
    const shooter = createPlayerState(sp.x, sp.y, sp.z, sp.yaw);
    const dir = viewDirection(sp.yaw, 0);
    const target = createPlayerState(sp.x + dir.x * 6, sp.y, sp.z + dir.z * 6);
    const eye = eyePosition(shooter);
    const toHead = { x: target.x - eye.x, y: hitboxOf(target).head.y - eye.y, z: target.z - eye.z };
    const len = Math.hypot(toHead.x, toHead.y, toHead.z);
    const head = resolveShot(physics, WEAPONS[1], eye, { x: toHead.x / len, y: toHead.y / len, z: toHead.z / len }, [
      { id: 9, hitbox: hitboxOf(target) },
    ]);
    expect(head.target?.id).toBe(9);
    expect(head.target?.part).toBe("head");
    expect(head.target?.damage).toBeCloseTo(WEAPONS[1].damage * 2);

    // Objectiu amagat darrere d'un edifici: el raig para a la façana.
    const b = map.buildings.find((x) => x.id === "B5")!;
    const c = centroid(b.footprint);
    const from = { x: c[0] + 40, y: b.baseY + 1.5, z: c[1] };
    const behind = createPlayerState(c[0] - 40, b.baseY, c[1]);
    const res = resolveShot(physics, WEAPONS[1], from, { x: -1, y: 0, z: 0 }, [{ id: 1, hitbox: hitboxOf(behind) }]);
    expect(res.target).toBeNull();
    expect(res.worldHit?.surface).toBe("building");
  });
});
