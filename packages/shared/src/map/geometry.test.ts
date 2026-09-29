import { describe, expect, it } from "vitest";
import { buildBuildingsMesh, buildTerrainMesh, buildWallsMesh, type MeshData } from "./geometry.ts";
import { TerrainField } from "./terrain.ts";
import type { BuildingData, WallData } from "./types.ts";

/** Comprova que cada triangle, segons el seu ordre de vèrtexs, apunta cap on diu la normal emmagatzemada. */
function expectWindingMatchesNormals(mesh: MeshData): void {
  const { positions: p, normals: n, indices } = mesh;
  expect(indices.length).toBeGreaterThan(0);
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]];
    const ux = p[b * 3] - p[a * 3];
    const uy = p[b * 3 + 1] - p[a * 3 + 1];
    const uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3];
    const vy = p[c * 3 + 1] - p[a * 3 + 1];
    const vz = p[c * 3 + 2] - p[a * 3 + 2];
    const gx = uy * vz - uz * vy;
    const gy = uz * vx - ux * vz;
    const gz = ux * vy - uy * vx;
    const dot = gx * n[a * 3] + gy * n[a * 3 + 1] + gz * n[a * 3 + 2];
    expect(dot).toBeGreaterThan(0);
  }
}

const flat = (cols: number, rows: number, h = 10) => new TerrainField(-10, -10, 2, cols, rows, new Float32Array(cols * rows).fill(h));

function building(footprint: [number, number][], extra: Partial<BuildingData> = {}): BuildingData {
  return {
    id: "T",
    osmId: 1,
    name: "T",
    kind: "university",
    footprint,
    holes: [],
    baseY: 10,
    footY: 9.5,
    height: 12,
    minHeight: 0,
    levels: 3,
    color: "#cccccc",
    facade: "strips",
    roofColor: "#888888",
    background: false,
    entrances: [],
    ...extra,
  };
}

describe("geometria del mapa", () => {
  it("el terreny apunta amunt i coincideix amb heightAt", () => {
    const heights = new Float32Array(16).map((_, i) => (i % 4) * 0.7 + Math.floor(i / 4) * 0.3);
    const t = new TerrainField(0, 0, 2, 4, 4, heights);
    const mesh = buildTerrainMesh(t);
    expectWindingMatchesNormals(mesh);
    expect(mesh.indices.length).toBe(3 * 3 * 6);
    expect(t.heightAt(2, 2)).toBeCloseTo(heights[1 * 4 + 1]);
  });

  it("parets i terrats d'un edifici miren cap a fora", () => {
    // Forma en L (còncava), en ordre positiu.
    const fp: [number, number][] = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]].map(([x, z]) => [x, -z]) as [number, number][];
    const ccw = fp.slice().reverse();
    const { walls, roofs } = buildBuildingsMesh([building(ccw)]);
    expectWindingMatchesNormals(walls);
    expectWindingMatchesNormals(roofs);
    // Normal d'una paret: ha d'apuntar lluny del centre de l'edifici.
    const n = walls.normals;
    const p = walls.positions;
    for (let v = 0; v < p.length / 3; v += 4) {
      const mx = (p[v * 3] + p[(v + 1) * 3]) / 2;
      const mz = (p[v * 3 + 2] + p[(v + 1) * 3 + 2]) / 2;
      // Un pas curt en la direcció de la normal ha de sortir de la L.
      const ox = mx + n[v * 3] * 0.1;
      const oz = mz + n[v * 3 + 2] * 0.1;
      const insideL = (x: number, z: number) => x > 0 && x < 10 && -z > 0 && -z < 10 && (x < 4 || -z < 4);
      expect(insideL(ox, oz)).toBe(false);
    }
  });

  it("sotabanc d'un voladís mira avall", () => {
    const { roofs } = buildBuildingsMesh([building([[0, 0], [5, 0], [5, 5], [0, 5]].map(([x, z]) => [x, z]).reverse() as [number, number][], { minHeight: 3 })]);
    expectWindingMatchesNormals(roofs);
    expect(Array.from(roofs.normals).some((v, i) => i % 3 === 1 && v < 0)).toBe(true);
  });

  it("murs i tanques: totes les cares miren cap a fora", () => {
    const walls: WallData[] = [
      { kind: "wall", points: [[0, 0], [6, 3], [9, -2]], height: 1.6, thickness: 0.3, closed: false },
      { kind: "retaining", points: [[-5, -5], [-5, 5]], height: 1, thickness: 0.4, closed: false },
      { kind: "planter", points: [[1, 1], [3, 1], [3, 3], [1, 3]], height: 0.5, thickness: 0.3, closed: true },
    ];
    expectWindingMatchesNormals(buildWallsMesh(walls, flat(12, 12)));
  });
});
