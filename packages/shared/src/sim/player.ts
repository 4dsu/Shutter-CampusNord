import type RAPIER_NS from "@dimforge/rapier3d-compat";
import { clamp } from "../math.ts";
import { PLAYER_GROUPS, QUERY_WORLD_ONLY } from "../physics/groups.ts";
import type { PhysicsWorld } from "../physics/world.ts";
import { Buttons, type PlayerInput, pressed } from "./input.ts";

/** Paràmetres del moviment (metres, segons). */
export const PLAYER = {
  radius: 0.35,
  standHeight: 1.8,
  crouchHeight: 1.25,
  standEye: 1.62,
  crouchEye: 1.08,
  walkSpeed: 4.6,
  sprintSpeed: 6.8,
  crouchSpeed: 2.3,
  groundAccel: 60,
  airAccel: 12,
  gravity: 22,
  jumpSpeed: 7.2,
  stepHeight: 0.42,
  maxSlope: (46 * Math.PI) / 180,
  snapToGround: 0.45,
  /** Marge del controlador de Rapier respecte de les superfícies. */
  skin: 0.02,
  maxPitch: 1.5,
} as const;

export interface PlayerState {
  /** Posició dels peus. */
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  onGround: boolean;
  crouching: boolean;
  /** 0 = dret … 1 = ajupit; es mou suaument per a la càmera. */
  crouchAmount: number;
}

export function createPlayerState(x: number, y: number, z: number, yaw = 0): PlayerState {
  return { x, y, z, vx: 0, vy: 0, vz: 0, yaw, pitch: 0, onGround: false, crouching: false, crouchAmount: 0 };
}

export function clonePlayerState(s: PlayerState): PlayerState {
  return { ...s };
}

export function eyeHeight(s: PlayerState): number {
  return PLAYER.standEye + (PLAYER.crouchEye - PLAYER.standEye) * s.crouchAmount;
}

const capsuleHalfHeight = (height: number): number => (height - 2 * PLAYER.radius) / 2;

/** Esdeveniments d'un pas de moviment, per a sons i efectes. */
export interface MoveEvents {
  jumped: boolean;
  /** Velocitat vertical en tocar terra (> 0 si ha aterrat en aquest pas). */
  landedSpeed: number;
}

/**
 * Cos físic d'un jugador: un col·lisionador en forma de càpsula mogut pel controlador cinemàtic de Rapier.
 * `step()` és determinista: amb el mateix món, estat i input dona el mateix resultat al client i al servidor.
 */
export class PlayerBody {
  private readonly physics: PhysicsWorld;
  private readonly controller: RAPIER_NS.KinematicCharacterController;
  private readonly collider: RAPIER_NS.Collider;
  private readonly standShape: RAPIER_NS.Capsule;
  private readonly crouchShape: RAPIER_NS.Capsule;
  private shapeCrouched = false;

  constructor(physics: PhysicsWorld) {
    this.physics = physics;
    const R = physics.rapier;
    this.standShape = new R.Capsule(capsuleHalfHeight(PLAYER.standHeight), PLAYER.radius);
    this.crouchShape = new R.Capsule(capsuleHalfHeight(PLAYER.crouchHeight), PLAYER.radius);
    this.collider = physics.world.createCollider(
      R.ColliderDesc.capsule(capsuleHalfHeight(PLAYER.standHeight), PLAYER.radius).setCollisionGroups(PLAYER_GROUPS).setSolverGroups(PLAYER_GROUPS),
    );
    const c = physics.world.createCharacterController(PLAYER.skin);
    c.setUp({ x: 0, y: 1, z: 0 });
    c.setMaxSlopeClimbAngle(PLAYER.maxSlope);
    c.setMinSlopeSlideAngle(PLAYER.maxSlope + 0.05);
    c.enableAutostep(PLAYER.stepHeight, 0.15, false);
    c.enableSnapToGround(PLAYER.snapToGround);
    c.setApplyImpulsesToDynamicBodies(false);
    c.setSlideEnabled(true);
    this.controller = c;
  }

  private setCrouchShape(crouched: boolean): void {
    if (crouched === this.shapeCrouched) return;
    this.collider.setShape(crouched ? this.crouchShape : this.standShape);
    this.shapeCrouched = crouched;
  }

  private placeCollider(s: PlayerState): void {
    const height = s.crouching ? PLAYER.crouchHeight : PLAYER.standHeight;
    this.collider.setTranslation({ x: s.x, y: s.y + height / 2, z: s.z });
  }

  /** Hi cap dret a la posició actual? (per aixecar-se d'ajupit sota un sostre baix) */
  private canStand(s: PlayerState): boolean {
    let blocked = false;
    this.physics.world.intersectionsWithShape(
      { x: s.x, y: s.y + PLAYER.standHeight / 2 + PLAYER.skin, z: s.z },
      { x: 0, y: 0, z: 0, w: 1 },
      this.standShape,
      () => {
        blocked = true;
        return false;
      },
      undefined,
      QUERY_WORLD_ONLY,
    );
    return !blocked;
  }

  /** Avança l'estat un pas `dt` segons l'input (modifica `s`). */
  step(s: PlayerState, input: PlayerInput, dt: number): MoveEvents {
    const events: MoveEvents = { jumped: false, landedSpeed: 0 };
    s.yaw = input.yaw;
    s.pitch = clamp(input.pitch, -PLAYER.maxPitch, PLAYER.maxPitch);

    // Ajupir-se / aixecar-se.
    const wantCrouch = pressed(input, Buttons.Crouch);
    if (wantCrouch) s.crouching = true;
    else if (s.crouching && this.canStand(s)) s.crouching = false;
    this.setCrouchShape(s.crouching);
    const crouchTarget = s.crouching ? 1 : 0;
    s.crouchAmount += clamp(crouchTarget - s.crouchAmount, -dt * 8, dt * 8);

    // Direcció desitjada en el pla, relativa a on mira el jugador.
    let fx = 0;
    let fz = 0;
    if (pressed(input, Buttons.Forward)) fz -= 1;
    if (pressed(input, Buttons.Back)) fz += 1;
    if (pressed(input, Buttons.Left)) fx -= 1;
    if (pressed(input, Buttons.Right)) fx += 1;
    const len = Math.hypot(fx, fz);
    let wishX = 0;
    let wishZ = 0;
    if (len > 0) {
      fx /= len;
      fz /= len;
      const sin = Math.sin(s.yaw);
      const cos = Math.cos(s.yaw);
      wishX = fx * cos + fz * sin;
      wishZ = -fx * sin + fz * cos;
    }
    const sprinting = pressed(input, Buttons.Sprint) && pressed(input, Buttons.Forward) && !s.crouching;
    const speed = s.crouching ? PLAYER.crouchSpeed : sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;

    // Acceleració horitzontal cap a la velocitat desitjada (a l'aire només si hi ha input).
    if (s.onGround || len > 0) {
      const accel = s.onGround ? PLAYER.groundAccel : PLAYER.airAccel;
      let dvx = wishX * speed - s.vx;
      let dvz = wishZ * speed - s.vz;
      const dv = Math.hypot(dvx, dvz);
      const maxDv = accel * dt;
      if (dv > maxDv) {
        dvx *= maxDv / dv;
        dvz *= maxDv / dv;
      }
      s.vx += dvx;
      s.vz += dvz;
    }

    // Salt i gravetat.
    if (s.onGround && pressed(input, Buttons.Jump) && !s.crouching) {
      s.vy = PLAYER.jumpSpeed;
      s.onGround = false;
      events.jumped = true;
    } else {
      s.vy -= PLAYER.gravity * dt;
    }

    // Moviment amb col·lisions.
    this.placeCollider(s);
    const desired = { x: s.vx * dt, y: s.vy * dt, z: s.vz * dt };
    this.controller.computeColliderMovement(this.collider, desired, undefined, QUERY_WORLD_ONLY);
    const moved = this.controller.computedMovement();
    const wasOnGround = s.onGround;
    s.x += moved.x;
    s.y += moved.y;
    s.z += moved.z;
    s.onGround = this.controller.computedGrounded();

    if (s.onGround) {
      if (!wasOnGround && s.vy < 0) events.landedSpeed = -s.vy;
      if (s.vy < 0) s.vy = 0;
    } else if (s.vy > 0 && moved.y < desired.y * 0.5) {
      s.vy = 0; // cop de cap al sostre
    }
    // Si una paret ens ha frenat, la velocitat horitzontal s'ajusta al que realment ens hem mogut.
    if (dt > 0) {
      const hx = moved.x / dt;
      const hz = moved.z / dt;
      if (Math.abs(hx) < Math.abs(s.vx)) s.vx = hx;
      if (Math.abs(hz) < Math.abs(s.vz)) s.vz = hz;
    }
    return events;
  }

  dispose(): void {
    this.physics.world.removeCollider(this.collider, false);
    this.physics.world.removeCharacterController(this.controller);
  }
}
