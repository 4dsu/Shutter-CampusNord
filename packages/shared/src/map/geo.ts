import type { Vec2 } from "./types.ts";

/** Àrea amb signe en el pla x-z (fórmula del sabater). Positiva = antihorari amb x a la dreta i z amunt. */
export function signedArea(ring: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % n];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

export function area(ring: readonly Vec2[]): number {
  return Math.abs(signedArea(ring));
}

/** Retorna l'anell amb l'orientació demanada (positiva = àrea amb signe > 0). */
export function withOrientation(ring: Vec2[], positive: boolean): Vec2[] {
  return signedArea(ring) > 0 === positive ? ring : ring.slice().reverse();
}

export function centroid(ring: readonly Vec2[]): Vec2 {
  let cx = 0;
  let cz = 0;
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % n];
    const f = x1 * z2 - x2 * z1;
    cx += (x1 + x2) * f;
    cz += (z1 + z2) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-9) {
    // Polígon degenerat: mitjana dels vèrtexs.
    const sx = ring.reduce((s, p) => s + p[0], 0);
    const sz = ring.reduce((s, p) => s + p[1], 0);
    return [sx / ring.length, sz / ring.length];
  }
  return [cx / (3 * a), cz / (3 * a)];
}

export function pointInRing(p: Vec2, ring: readonly Vec2[]): boolean {
  const [x, z] = p;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(p: Vec2, ring: readonly Vec2[], holes: readonly (readonly Vec2[])[] = []): boolean {
  return pointInRing(p, ring) && !holes.some((h) => pointInRing(p, h));
}

export interface Bounds2 {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export function bounds(points: readonly Vec2[]): Bounds2 {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minZ, maxX, maxZ };
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Distància d'un punt a un segment. */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

export function polylineLength(points: readonly Vec2[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += distance(points[i - 1], points[i]);
  return len;
}

/**
 * Neteja un anell: treu el punt de tancament repetit, punts duplicats (< eps) i vèrtexs col·lineals.
 */
export function cleanRing(ring: readonly Vec2[], eps = 0.05): Vec2[] {
  let pts = ring.slice();
  if (pts.length > 1 && distance(pts[0], pts[pts.length - 1]) < eps) pts.pop();
  pts = pts.filter((p, i) => distance(p, pts[(i + 1) % pts.length]) >= eps);
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      // Àrea del triangle ≈ 0 → b és col·lineal.
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(cross) < eps * distance(a, c)) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

/** Punts cada `step` metres al llarg d'una polilínia (inclou els extrems). */
export function resamplePolyline(points: readonly Vec2[], step: number): Vec2[] {
  const out: Vec2[] = [];
  if (points.length === 0) return out;
  out.push([points[0][0], points[0][1]]);
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = distance(a, b);
    let t = step - carry;
    while (t < len) {
      out.push([a[0] + ((b[0] - a[0]) * t) / len, a[1] + ((b[1] - a[1]) * t) / len]);
      t += step;
    }
    carry = len - (t - step);
  }
  const last = points[points.length - 1];
  if (distance(out[out.length - 1], last) > step * 0.25) out.push([last[0], last[1]]);
  return out;
}

/** Hash determinista (0..1) a partir d'un enter; serveix per variar objectes de manera estable. */
export function hash01(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
