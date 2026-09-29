import * as THREE from "three";
import type { SpawnPoint } from "@shutter/shared/map";
import type { PhysicsWorld } from "@shutter/shared/physics";
import {
  Buttons,
  type HitPart,
  PlayerBody,
  type PlayerState,
  type ShotTarget,
  clonePlayerState,
  createPlayerState,
  hitboxOf,
} from "@shutter/shared/sim";
import { CharacterModel } from "../render/character.ts";

const MAX_HEALTH = 100;
const RESPAWN_TIME = 3;

interface Dummy {
  id: number;
  home: SpawnPoint;
  state: PlayerState;
  prev: PlayerState;
  body: PlayerBody;
  model: CharacterModel;
  health: number;
  respawn: number;
  /** Les dianes mòbils van d'un costat a l'altre per practicar la punteria. */
  moving: boolean;
  clock: number;
}

/** Dianes d'entrenament: ninots que es mouen amb la mateixa simulació que el jugador. */
export class DummyManager {
  readonly group = new THREE.Group();
  private readonly dummies: Dummy[] = [];

  constructor(physics: PhysicsWorld, points: SpawnPoint[], facing: { x: number; z: number }) {
    this.group.name = "dummies";
    points.forEach((home, i) => {
      // Mirant cap al jugador.
      const yaw = Math.atan2(-(facing.x - home.x), -(facing.z - home.z));
      const state = createPlayerState(home.x, home.y, home.z, yaw);
      const model = new CharacterModel({ shirt: "#d8b43f", pants: "#3a3f47", skin: "#d9a47e" }, false);
      this.group.add(model.root);
      this.dummies.push({
        id: i + 1,
        home: { ...home, yaw },
        state,
        prev: clonePlayerState(state),
        body: new PlayerBody(physics),
        model,
        health: MAX_HEALTH,
        respawn: 0,
        moving: i % 2 === 1,
        clock: i * 0.37,
      });
    });
  }

  /** Posicions i vida (per a depuració i proves). */
  list(): { id: number; x: number; y: number; z: number; health: number }[] {
    return this.dummies.map((d) => ({ id: d.id, x: d.state.x, y: d.state.y, z: d.state.z, health: d.health }));
  }

  targets(): ShotTarget[] {
    return this.dummies.filter((d) => d.health > 0).map((d) => ({ id: d.id, hitbox: hitboxOf(d.state) }));
  }

  /** Aplica dany; retorna si l'ha abatut. */
  damage(id: number, amount: number, _part: HitPart): boolean {
    const d = this.dummies.find((x) => x.id === id);
    if (!d || d.health <= 0) return false;
    d.health -= amount;
    d.model.hitFlash();
    if (d.health > 0) return false;
    d.health = 0;
    d.respawn = RESPAWN_TIME;
    d.model.die();
    return true;
  }

  step(dt: number): void {
    for (const d of this.dummies) {
      Object.assign(d.prev, d.state);
      if (d.health <= 0) {
        d.respawn -= dt;
        if (d.respawn <= 0) {
          Object.assign(d.state, createPlayerState(d.home.x, d.home.y, d.home.z, d.home.yaw));
          Object.assign(d.prev, d.state);
          d.health = MAX_HEALTH;
          d.model.revive();
        }
        continue;
      }
      d.clock += dt;
      const strafe = d.moving ? (Math.floor(d.clock / 1.6) % 2 === 0 ? Buttons.Left : Buttons.Right) : 0;
      d.body.step(d.state, { seq: 0, buttons: strafe, yaw: d.home.yaw, pitch: 0, weapon: 0 }, dt);
    }
  }

  /** Dibuixa les dianes interpolant entre els dos últims ticks. */
  render(alpha: number, dt: number): void {
    for (const d of this.dummies) {
      const p = d.prev;
      const s = d.state;
      d.model.update(
        {
          x: p.x + (s.x - p.x) * alpha,
          y: p.y + (s.y - p.y) * alpha,
          z: p.z + (s.z - p.z) * alpha,
          yaw: s.yaw,
          pitch: 0,
          vx: s.vx,
          vz: s.vz,
          onGround: s.onGround,
          crouchAmount: s.crouchAmount,
        },
        dt,
      );
      d.model.root.visible = d.health > 0 || d.respawn > RESPAWN_TIME - 1.2;
    }
  }
}
