import { centroid, distanceToSegment, hash01, pointInRing, resamplePolyline } from "./geo.ts";
import type { TerrainField } from "./terrain.ts";
import type { MapData, Vec2 } from "./types.ts";

export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface SpawnOptions {
  count: number;
  seed?: number;
  /** Distància mínima entre punts triats (m). */
  minSpacing?: number;
  /** Distància mínima a façanes i murs (m). */
  clearance?: number;
}

function minDistanceToRing(p: Vec2, ring: readonly Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) best = Math.min(best, distanceToSegment(p, ring[i], ring[(i + 1) % ring.length]));
  return best;
}

/**
 * Punts d'aparició sobre camins de vianants: dins del límit jugable, lluny de façanes i murs i en terreny poc inclinat.
 * El resultat és determinista per a una mateixa llavor.
 */
export function findSpawnPoints(map: MapData, terrain: TerrainField, options: SpawnOptions): SpawnPoint[] {
  const { count, seed = 1, minSpacing = 10, clearance = 2.5 } = options;
  const buildings = map.buildings.filter((b) => !b.background);
  const walls = map.walls.map((w) => (w.closed ? [...w.points, w.points[0]] : w.points));
  const center = centroid(map.playArea);

  const candidates: Vec2[] = [];
  for (const path of map.paths) {
    if (path.kind !== "footway" && path.kind !== "pedestrian" && path.kind !== "path") continue;
    for (const p of resamplePolyline(path.points, 4)) {
      if (!pointInRing(p, map.playArea) || minDistanceToRing(p, map.playArea) < 6) continue;
      if (buildings.some((b) => pointInRing(p, b.footprint) || minDistanceToRing(p, b.footprint) < clearance)) continue;
      if (walls.some((w) => w.some((q, i) => i > 0 && distanceToSegment(p, w[i - 1], q) < 1.5))) continue;
      const sx = (terrain.heightAt(p[0] + 1, p[1]) - terrain.heightAt(p[0] - 1, p[1])) / 2;
      const sz = (terrain.heightAt(p[0], p[1] + 1) - terrain.heightAt(p[0], p[1] - 1)) / 2;
      if (Math.hypot(sx, sz) > 0.35) continue;
      candidates.push(p);
    }
  }

  // Ordre pseudoaleatori estable i selecció amb separació mínima.
  const order = candidates.map((p, i) => ({ p, k: hash01(i * 7919 + seed * 104729) })).sort((a, b) => a.k - b.k);
  const chosen: Vec2[] = [];
  for (const { p } of order) {
    if (chosen.length >= count) break;
    if (chosen.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) >= minSpacing)) chosen.push(p);
  }
  return chosen.map(([x, z]) => ({
    x,
    y: terrain.heightAt(x, z) + 0.05,
    z,
    // Mirant cap al centre del campus (yaw = 0 mira cap a −z).
    yaw: Math.atan2(-(center[0] - x), -(center[1] - z)),
  }));
}
