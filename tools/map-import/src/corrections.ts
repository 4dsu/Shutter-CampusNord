import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  type BuildingData,
  type MapCorrections,
  type Vec2,
  bounds,
  cleanRing,
  distanceToSegment,
  emptyCorrections,
  pointInRing,
  resamplePolyline,
  withOrientation,
} from "@shutter/shared/map";
import type { GridSpec } from "./build.ts";

/** Amplada de la transició entre una plataforma plana i el terreny original (m). */
const PLATFORM_BLEND = 3;

export async function loadCorrections(file: string): Promise<MapCorrections> {
  if (!existsSync(file)) return emptyCorrections();
  const data = JSON.parse(await readFile(file, "utf8")) as Partial<MapCorrections>;
  return { ...emptyCorrections(), ...data, version: 1 };
}

function distanceToRing(p: Vec2, ring: Vec2[]): number {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) d = Math.min(d, distanceToSegment(p, ring[i], ring[(i + 1) % ring.length]));
  return d;
}

/** Aplana el terreny dins de cada plataforma (alçades relatives al datum; modifica `heights`). */
export function applyPlatforms(grid: GridSpec, heights: Float32Array, datum: number, corrections: MapCorrections): void {
  for (const platform of corrections.platforms) {
    if (platform.ring.length < 3) continue;
    const target = platform.elevation - datum;
    const b = bounds(platform.ring);
    const c0 = Math.max(0, Math.floor((b.minX - PLATFORM_BLEND - grid.originX) / grid.cellSize));
    const c1 = Math.min(grid.cols - 1, Math.ceil((b.maxX + PLATFORM_BLEND - grid.originX) / grid.cellSize));
    const r0 = Math.max(0, Math.floor((b.minZ - PLATFORM_BLEND - grid.originZ) / grid.cellSize));
    const r1 = Math.min(grid.rows - 1, Math.ceil((b.maxZ + PLATFORM_BLEND - grid.originZ) / grid.cellSize));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const p: Vec2 = [grid.originX + c * grid.cellSize, grid.originZ + r * grid.cellSize];
        const i = r * grid.cols + c;
        if (pointInRing(p, platform.ring)) {
          heights[i] = target;
        } else {
          const d = distanceToRing(p, platform.ring);
          if (d < PLATFORM_BLEND) heights[i] += (target - heights[i]) * (1 - d / PLATFORM_BLEND);
        }
      }
    }
  }
}

function perimeterStats(ring: Vec2[], heightAt: (p: Vec2) => number): { median: number; min: number } {
  const hs = resamplePolyline([...ring, ring[0]], 1).map(heightAt).sort((a, b) => a - b);
  return { median: hs[Math.floor(hs.length / 2)], min: hs[0] };
}

const r2 = (v: number): number => Math.round(v * 100) / 100;
const cleanFootprint = (ring: Vec2[]): Vec2[] => withOrientation(cleanRing(ring), true).map(([x, z]) => [r2(x), r2(z)]);

/** Aplica els canvis, eliminacions i edificis nous de les correccions. */
export function applyBuildingCorrections(
  buildings: BuildingData[],
  corrections: MapCorrections,
  heightAt: (p: Vec2) => number,
  floorHeight: (b: BuildingData) => number,
): BuildingData[] {
  const out: BuildingData[] = [];
  for (const b of buildings) {
    const corr = corrections.buildings[b.id];
    if (!corr) {
      out.push(b);
      continue;
    }
    if (corr.remove) continue;
    const next: BuildingData = { ...b };
    if (corr.footprint && corr.footprint.length >= 3) {
      next.footprint = cleanFootprint(corr.footprint);
      next.holes = [];
      const stats = perimeterStats(next.footprint, heightAt);
      next.footY = r2(Math.min(next.baseY, stats.min - 0.5));
    }
    if (corr.levels !== undefined) next.levels = corr.levels;
    if (corr.facade) next.facade = corr.facade;
    if (corr.name !== undefined) next.name = corr.name;
    if (corr.minHeight !== undefined) next.minHeight = corr.minHeight;
    next.height = r2(corr.height ?? (corr.levels !== undefined ? corr.levels * floorHeight(b) : b.height));
    out.push(next);
  }
  for (const a of corrections.added) {
    if (a.footprint.length < 3) continue;
    const footprint = cleanFootprint(a.footprint);
    const stats = perimeterStats(footprint, heightAt);
    out.push({
      id: a.id,
      osmId: 0,
      name: a.name ?? "",
      kind: "university",
      footprint,
      holes: [],
      baseY: r2(stats.median),
      footY: r2(stats.min - 0.5),
      height: r2(a.height ?? a.levels * 3.6),
      minHeight: a.minHeight ?? 0,
      levels: a.levels,
      color: "#d6d2c9",
      facade: a.facade ?? "strips",
      roofColor: "#8f8c86",
      background: false,
      entrances: [],
    });
  }
  return out;
}
