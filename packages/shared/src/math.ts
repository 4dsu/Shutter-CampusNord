/** Vector 3D pla (compatible amb el `Vector` de Rapier). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export function length3(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function normalize3(v: Vec3): Vec3 {
  const l = length3(v) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

export function add3(a: Vec3, b: Vec3, scale = 1): Vec3 {
  return { x: a.x + b.x * scale, y: a.y + b.y * scale, z: a.z + b.z * scale };
}

export function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Direcció de mirada a partir de yaw i pitch (radians).
 * yaw = 0 mira cap al nord (−z); yaw positiu gira cap a l'oest (−x), com la rotació de Three.js al voltant de y.
 */
export function viewDirection(yaw: number, pitch: number): Vec3 {
  const c = Math.cos(pitch);
  return { x: -Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c };
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Normalitza un angle a (−π, π]. */
export function wrapAngle(a: number): number {
  const t = (a + Math.PI) % (Math.PI * 2);
  return (t < 0 ? t + Math.PI * 2 : t) - Math.PI;
}
