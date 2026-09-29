import { type Vec3, add3, clamp } from "../math.ts";
import type { PhysicsWorld, RayHit } from "../physics/world.ts";
import { type HitPart, type Hitbox, rayHitbox } from "./hitbox.ts";
import type { WeaponSpec } from "./weapons.ts";

export interface ShotTarget {
  id: number;
  hitbox: Hitbox;
}

export interface TargetHit {
  id: number;
  part: HitPart;
  distance: number;
  damage: number;
}

export interface ShotResult {
  /** Punt on acaba la bala (impacte o abast màxim). */
  end: Vec3;
  /** Impacte amb el món, si és el més proper. */
  worldHit: RayHit | null;
  target: TargetHit | null;
}

export function damageAt(spec: WeaponSpec, distance: number, part: HitPart): number {
  const t = clamp((distance - spec.falloffStart) / (spec.falloffEnd - spec.falloffStart), 0, 1);
  const factor = 1 - t * (1 - spec.minDamageFactor);
  return spec.damage * factor * (part === "head" ? spec.headshotMultiplier : 1);
}

/** Resol una bala: primer el món (Rapier) i després les hitboxes que hi ha abans de la paret. */
export function resolveShot(
  physics: PhysicsWorld,
  spec: WeaponSpec,
  origin: Vec3,
  dir: Vec3,
  targets: readonly ShotTarget[],
  shooterId = -1,
): ShotResult {
  const worldHit = physics.raycast(origin, dir, spec.range);
  const maxDistance = worldHit ? worldHit.distance : spec.range;
  let target: TargetHit | null = null;
  for (const t of targets) {
    if (t.id === shooterId) continue;
    const hit = rayHitbox(origin, dir, t.hitbox, maxDistance);
    if (hit && (!target || hit.distance < target.distance)) {
      target = { id: t.id, part: hit.part, distance: hit.distance, damage: damageAt(spec, hit.distance, hit.part) };
    }
  }
  if (target) return { end: add3(origin, dir, target.distance), worldHit: null, target };
  return { end: worldHit ? worldHit.point : add3(origin, dir, spec.range), worldHit, target: null };
}
