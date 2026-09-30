import { describe, expect, it } from "vitest";
import { type BuildingData, emptyCorrections, signedArea } from "@shutter/shared/map";
import type { GridSpec } from "./build.ts";
import { applyBuildingCorrections, applyPlatforms } from "./corrections.ts";

const grid: GridSpec = { originX: 0, originZ: 0, cellSize: 2, cols: 21, rows: 21 };

function building(id: string, extra: Partial<BuildingData> = {}): BuildingData {
  return {
    id,
    osmId: 1,
    name: id,
    kind: "university",
    footprint: [[0, 0], [0, -10], [10, -10], [10, 0]],
    holes: [],
    baseY: 5,
    footY: 4,
    height: 11.4,
    minHeight: 0,
    levels: 3,
    color: "#ccc",
    facade: "campus",
    roofColor: "#888",
    background: false,
    entrances: [],
    ...extra,
  };
}

describe("correccions del mapa", () => {
  it("una plataforma aplana el terreny i fa una transició suau a fora", () => {
    // Pendent de 0,5 m per cel·la en x (alçades relatives al datum 60).
    const heights = new Float32Array(21 * 21).map((_, i) => (i % 21) * 0.5);
    const corr = emptyCorrections();
    corr.platforms.push({ id: "placa", ring: [[10, 10], [10, 30], [30, 30], [30, 10]], elevation: 66 });
    applyPlatforms(grid, heights, 60, corr);
    const at = (x: number, z: number) => heights[(z / 2) * 21 + x / 2];
    expect(at(20, 20)).toBeCloseTo(6);
    expect(at(12, 28)).toBeCloseTo(6);
    // Lluny de la plataforma no canvia res.
    expect(at(2, 2)).toBeCloseTo(0.5);
    // A 2 m de la vora (x = 32, alçada original 8) queda entre l'original i la de la plataforma: 8 + (6 − 8) / 3.
    expect(at(32, 20)).toBeCloseTo(8 - 2 / 3);
    // A 4 m ja no s'hi toca.
    expect(at(34, 20)).toBeCloseTo(8.5);
  });

  it("modifica, elimina i afegeix edificis", () => {
    const corr = emptyCorrections();
    corr.buildings.A1 = { footprint: [[0, 0], [20, 0], [20, -8], [0, -8]], levels: 5 };
    corr.buildings.B2 = { remove: true };
    corr.added.push({ id: "porxo-1", footprint: [[40, 0], [40, -4], [50, -4], [50, 0]], levels: 1, minHeight: 3, height: 3.4 });
    const out = applyBuildingCorrections([building("A1"), building("B2"), building("C3")], corr, () => 5, () => 3.8);
    expect(out.map((b) => b.id)).toEqual(["A1", "C3", "porxo-1"]);
    const a1 = out[0];
    expect(a1.levels).toBe(5);
    expect(a1.height).toBeCloseTo(19);
    expect(signedArea(a1.footprint)).toBeGreaterThan(0); // l'ordre del polígon es normalitza
    const porxo = out[2];
    expect(porxo.minHeight).toBe(3);
    expect(porxo.height).toBe(3.4);
    expect(porxo.baseY).toBe(5);
  });
});
