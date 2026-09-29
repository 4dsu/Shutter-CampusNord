import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type MapData, MAP_FORMAT_VERSION, TerrainField, area, pointInRing, signedArea } from "@shutter/shared/map";

/** Valida el mapa generat que hi ha al repositori (assets/maps/campus-nord.json). */
const map = JSON.parse(readFileSync(new URL("../../../assets/maps/campus-nord.json", import.meta.url), "utf8")) as MapData;
const terrain = TerrainField.fromData(map.terrain);

describe("mapa del Campus Nord", () => {
  it("té el format esperat", () => {
    expect(map.format).toBe(MAP_FORMAT_VERSION);
    expect(map.attribution.join(" ")).toContain("OpenStreetMap");
  });

  it("conté tots els edificis de la graella A1–D6 dins del límit jugable", () => {
    const ids = new Set(map.buildings.map((b) => b.id.replace(/-p\d+$/, "")));
    for (const row of "ABCD") {
      for (let n = 1; n <= 6; n++) expect(ids, `${row}${n}`).toContain(`${row}${n}`);
    }
    for (const id of ["omega", "nexus2", "biblioteca", "capella"]) expect(ids).toContain(id);
    const grid = map.buildings.filter((b) => /^[A-D]\d/.test(b.id));
    expect(grid.every((b) => !b.background && b.facade === "campus")).toBe(true);
  });

  it("els polígons dels edificis són vàlids", () => {
    for (const b of map.buildings) {
      expect(b.footprint.length, b.id).toBeGreaterThanOrEqual(3);
      expect(signedArea(b.footprint), b.id).toBeGreaterThan(0);
      expect(b.footprint.flat().every(Number.isFinite), b.id).toBe(true);
      expect(b.height, b.id).toBeGreaterThan(b.minHeight);
      expect(b.footY, b.id).toBeLessThanOrEqual(b.baseY);
    }
  });

  it("el terreny del campus té alçades reals (entre 75 i 130 m sobre el mar)", () => {
    expect(terrain.heights.every(Number.isFinite)).toBe(true);
    let min = Infinity;
    let max = -Infinity;
    for (let r = 0; r < terrain.rows; r++) {
      for (let c = 0; c < terrain.cols; c++) {
        const x = terrain.originX + c * terrain.cellSize;
        const z = terrain.originZ + r * terrain.cellSize;
        if (!pointInRing([x, z], map.playArea)) continue;
        const h = terrain.heights[r * terrain.cols + c] + map.datum;
        min = Math.min(min, h);
        max = Math.max(max, h);
      }
    }
    expect(min).toBeGreaterThan(75);
    expect(max).toBeLessThan(130);
    // El campus fa pendent cap al sud-est: la fila D és més alta que la fila A.
    const base = (id: string) => map.buildings.find((b) => b.id === id || b.id === `${id}-p0`)!.baseY;
    expect(base("D3")).toBeGreaterThan(base("A3"));
  });

  it("el límit jugable és un polígon raonable", () => {
    expect(area(map.playArea) / 10000).toBeGreaterThan(8); // hectàrees
    expect(map.props.filter((p) => p.kind === "tree").length).toBeGreaterThan(100);
  });
});
