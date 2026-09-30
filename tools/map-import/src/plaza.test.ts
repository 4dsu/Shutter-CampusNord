import { describe, expect, it } from "vitest";
import { type BuildingData, type Vec2, TerrainField } from "@shutter/shared/map";
import { raisePlazaDecks } from "./plaza.ts";

/** Pendent cap al sud (z+): baixa 0,1 m per metre, de 22 m a z = -60 fins a 10 m a z = 60. */
function slope(): TerrainField {
  const cols = 61;
  const rows = 61;
  const heights = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) heights[r * cols + c] = 16 - (r * 2 - 60) * 0.1;
  return new TerrainField(-60, -60, 2, cols, rows, heights);
}

const square = (h: number): Vec2[] => [[-h, -h], [-h, h], [h, h], [h, -h]].map(([x, z]) => [x, z] as Vec2);

const box: BuildingData = {
  id: "caixa",
  osmId: 1,
  name: "",
  kind: "sports",
  footprint: square(8),
  holes: [],
  baseY: 16,
  footY: 14,
  height: 9,
  minHeight: 0,
  levels: 2,
  color: "#ffffff",
  facade: "strips",
  roofColor: "#888888",
  background: false,
  entrances: [],
};

describe("places elevades", () => {
  const terrain = slope();
  const { buildings, props } = raisePlazaDecks(
    {
      buildings: [box],
      areas: [{ kind: "paving", ring: square(25), holes: [] }],
      props: [{ kind: "bench", pos: [0, 0], rot: 0, scale: 1 }, { kind: "bench", pos: [40, 40], rot: 0, scale: 1 }],
      terrain,
    },
    [{ building: "caixa", color: "#dddddd", deckColor: "#cccccc" }],
  );
  const deck = buildings.find((b) => b.id === "caixa")!;

  it("l'edifici ocupa tota la plaça i el terrat queda a l'altura del costat alt", () => {
    expect(deck.footprint).toHaveLength(4);
    expect(deck.baseY + deck.height).toBeCloseTo(18.5, 1);
    expect(deck.baseY).toBeCloseTo(13.5, 1);
    expect(buildings.filter((b) => b.id.startsWith("caixa-lucernari")).length).toBeGreaterThan(0);
    expect(props).toHaveLength(1);
  });

  it("fa rampa només on el desnivell és petit", () => {
    // Vora est, cap al nord (desnivell de 0,5 m): el terreny puja cap a la plaça i s'esvaeix a 10 m.
    expect(terrain.heightAt(28, -20)).toBeCloseTo(18 + 0.5 * 0.7, 2);
    expect(terrain.heightAt(36, -20)).toBeCloseTo(18, 3);
    // Vora est cap al sud i vora sud (desnivell de 4,5–5 m): hi queda la façana.
    expect(terrain.heightAt(28, 20)).toBeCloseTo(14, 3);
    expect(terrain.heightAt(0, 28)).toBeCloseTo(13.2, 3);
  });
});
