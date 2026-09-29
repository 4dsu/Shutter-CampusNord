import type { Vec3 } from "../math.ts";
import { type PlayerState, eyeHeight } from "./player.ts";

export type HitPart = "head" | "body";

/** Zones d'impacte d'un jugador: esfera del cap i càpsula vertical del cos. */
export interface Hitbox {
  head: { x: number; y: number; z: number; r: number };
  body: { x: number; z: number; y0: number; y1: number; r: number };
}

export const HEAD_RADIUS = 0.17;
export const BODY_RADIUS = 0.3;

export function hitboxOf(s: PlayerState): Hitbox {
  const eye = s.y + eyeHeight(s);
  return {
    head: { x: s.x, y: eye + 0.02, z: s.z, r: HEAD_RADIUS },
    body: { x: s.x, z: s.z, y0: s.y + 0.3, y1: eye - 0.35, r: BODY_RADIUS },
  };
}

/** Distància al punt d'entrada d'un raig (dir normalitzada) en una esfera, o null. */
export function raySphere(o: Vec3, d: Vec3, cx: number, cy: number, cz: number, r: number): number | null {
  const ox = o.x - cx;
  const oy = o.y - cy;
  const oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - c;
  if (h < 0) return null;
  const t = -b - Math.sqrt(h);
  return t >= 0 ? t : null;
}

/** Raig contra una càpsula de segment [a, b] i radi r (mètode d'Íñigo Quílez). */
export function rayCapsule(o: Vec3, d: Vec3, a: Vec3, b: Vec3, r: number): number | null {
  const bax = b.x - a.x;
  const bay = b.y - a.y;
  const baz = b.z - a.z;
  const oax = o.x - a.x;
  const oay = o.y - a.y;
  const oaz = o.z - a.z;
  const baba = bax * bax + bay * bay + baz * baz;
  const bard = bax * d.x + bay * d.y + baz * d.z;
  const baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = d.x * oax + d.y * oay + d.z * oaz;
  const oaoa = oax * oax + oay * oay + oaz * oaz;
  const qa = baba - bard * bard;
  if (qa > 1e-9) {
    const qb = baba * rdoa - baoa * bard;
    const qc = baba * oaoa - baoa * baoa - r * r * baba;
    const h = qb * qb - qa * qc;
    if (h < 0) return null;
    const t = (-qb - Math.sqrt(h)) / qa;
    const y = baoa + t * bard;
    if (y > 0 && y < baba) return t >= 0 ? t : null;
  }
  // Extrems: esferes a a i b.
  const ta = raySphere(o, d, a.x, a.y, a.z, r);
  const tb = raySphere(o, d, b.x, b.y, b.z, r);
  if (ta === null) return tb;
  if (tb === null) return ta;
  return Math.min(ta, tb);
}

export function rayHitbox(o: Vec3, d: Vec3, hb: Hitbox, maxDistance: number): { distance: number; part: HitPart } | null {
  const th = raySphere(o, d, hb.head.x, hb.head.y, hb.head.z, hb.head.r);
  const tb = rayCapsule(
    o,
    d,
    { x: hb.body.x, y: hb.body.y0, z: hb.body.z },
    { x: hb.body.x, y: hb.body.y1, z: hb.body.z },
    hb.body.r,
  );
  let best: { distance: number; part: HitPart } | null = null;
  if (th !== null && th <= maxDistance) best = { distance: th, part: "head" };
  if (tb !== null && tb <= maxDistance && (!best || tb < best.distance)) best = { distance: tb, part: "body" };
  return best;
}
