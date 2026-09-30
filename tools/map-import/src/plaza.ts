import {
  type AreaData,
  type BuildingData,
  type PropData,
  type TerrainField,
  type Vec2,
  area,
  bounds,
  centroid,
  cleanRing,
  distance,
  distanceToSegment,
  pointInRing,
  resamplePolyline,
  withOrientation,
} from "@shutter/shared/map";
import type { PlazaDeckSpec } from "./overrides.ts";

/**
 * Places elevades: places que són el terrat d'un edifici semisoterrat (la Plaça de les Constel·lacions cobreix el
 * poliesportiu). OSM només en dibuixa la caixa de l'edifici i el MET-5 és terreny nu, de manera que la plaça quedava
 * a l'altura de la gespa de sota. Aquí l'edifici passa a ocupar tota la zona pavimentada que el conté, el terrat
 * queda pla a l'altura del costat alt i, on el desnivell és petit, el terreny del voltant puja en rampa fins a la plaça.
 */

/** Distància en planta de la rampa que puja fins a la plaça (m). */
const RAMP_LENGTH = 10;
/** Desnivells a la vora (m): fins a RAMP_FULL s'hi fa rampa; a partir de RAMP_NONE hi queda la façana. */
const RAMP_FULL = 2;
const RAMP_NONE = 2.8;

/** Lucernaris del poliesportiu que sobresurten de la plaça (també fan de cobertura). */
const SKYLIGHT_SPACING = 15;
const SKYLIGHT_SIZE = 3;
const SKYLIGHT_HEIGHT = 1.6;
const SKYLIGHT_MARGIN = 8;

const r2 = (v: number): number => Math.round(v * 100) / 100;
const rp = (p: Vec2): Vec2 => [r2(p[0]), r2(p[1])];

function distanceToRing(p: Vec2, ring: readonly Vec2[]): number {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) d = Math.min(d, distanceToSegment(p, ring[i], ring[(i + 1) % ring.length]));
  return d;
}

export interface PlazaInput {
  buildings: BuildingData[];
  areas: readonly AreaData[];
  props: PropData[];
  /** Es modifica: s'hi afegeixen les rampes. */
  terrain: TerrainField;
}

export function raisePlazaDecks(input: PlazaInput, specs: readonly PlazaDeckSpec[]): { buildings: BuildingData[]; props: PropData[] } {
  let { buildings, props } = input;
  for (const spec of specs) {
    const index = buildings.findIndex((b) => b.id === spec.building);
    if (index < 0) throw new Error(`Plaça elevada: no hi ha l'edifici ${spec.building}`);
    const b = buildings[index];

    // La plaça és la zona pavimentada més gran que conté l'edifici.
    const c = centroid(b.footprint);
    const plaza = input.areas
      .filter((a) => a.kind === "paving" && pointInRing(c, a.ring))
      .reduce<AreaData | undefined>((best, a) => (!best || area(a.ring) > area(best.ring) ? a : best), undefined);
    const outline = withOrientation(cleanRing(plaza ? plaza.ring : b.footprint), true).map(rp);

    const edge = resamplePolyline([...outline, outline[0]], 1);
    const edgeY = edge.map(([x, z]) => input.terrain.heightAt(x, z));
    const deckY = r2(Math.max(...edgeY));
    const lowY = r2(Math.min(...edgeY));
    rampTerrain(input.terrain, outline, edge, edgeY, deckY);

    const deck: BuildingData = {
      ...b,
      footprint: outline,
      holes: [],
      baseY: lowY,
      footY: r2(lowY - 0.5),
      height: r2(deckY - lowY),
      minHeight: 0,
      // Una sola planta alta: la pista, amb vidrieres sota la cornisa de formigó.
      levels: 1,
      facade: "glass",
      color: spec.color,
      roofColor: spec.deckColor,
    };
    const others = buildings.filter((o) => o !== b);
    buildings = [...buildings.slice(0, index), deck, ...skylights(deck, outline, deckY, others), ...buildings.slice(index + 1)];
    // Els objectes d'OSM dins la plaça quedarien enterrats dins l'edifici.
    props = props.filter((p) => !pointInRing(p.pos, outline));
  }
  return { buildings, props };
}

/** Rampa del terreny cap a la vora de la plaça allà on el desnivell és petit (costat alt). */
function rampTerrain(t: TerrainField, outline: readonly Vec2[], edge: readonly Vec2[], edgeY: readonly number[], deckY: number): void {
  const bb = bounds(outline);
  const c0 = Math.max(0, Math.floor((bb.minX - RAMP_LENGTH - t.originX) / t.cellSize));
  const c1 = Math.min(t.cols - 1, Math.ceil((bb.maxX + RAMP_LENGTH - t.originX) / t.cellSize));
  const r0 = Math.max(0, Math.floor((bb.minZ - RAMP_LENGTH - t.originZ) / t.cellSize));
  const r1 = Math.min(t.rows - 1, Math.ceil((bb.maxZ + RAMP_LENGTH - t.originZ) / t.cellSize));
  for (let r = r0; r <= r1; r++) {
    for (let col = c0; col <= c1; col++) {
      const p: Vec2 = [t.originX + col * t.cellSize, t.originZ + r * t.cellSize];
      let k = 0;
      let d = Infinity;
      for (let i = 0; i < edge.length; i++) {
        const di = distance(p, edge[i]);
        if (di < d) {
          d = di;
          k = i;
        }
      }
      const inside = pointInRing(p, outline);
      if (!inside && d >= RAMP_LENGTH) continue;
      // Pes segons el desnivell a la vora més propera; dins la plaça el terreny queda amagat sota el terrat.
      const w = Math.max(0, Math.min(1, (RAMP_NONE - (deckY - edgeY[k])) / (RAMP_NONE - RAMP_FULL)));
      const f = inside ? 1 : 1 - d / RAMP_LENGTH;
      const i = r * t.cols + col;
      const h = t.heights[i];
      if (h < deckY) t.heights[i] = h + (deckY - h) * w * f;
    }
  }
}

/** Lucernaris en una graella al tresbolillo alineada amb la vora més llarga de la plaça. */
function skylights(deck: BuildingData, outline: readonly Vec2[], deckY: number, others: readonly BuildingData[]): BuildingData[] {
  let axis: Vec2 = [1, 0];
  let longest = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const len = distance(a, b);
    if (len > longest) {
      longest = len;
      axis = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    }
  }
  const perp: Vec2 = [-axis[1], axis[0]];
  const o = centroid(outline);
  const at = (u: number, v: number): Vec2 => [o[0] + axis[0] * u + perp[0] * v, o[1] + axis[1] * u + perp[1] * v];
  const half = SKYLIGHT_SIZE / 2;
  const result: BuildingData[] = [];
  for (let j = -8; j <= 8; j++) {
    for (let i = -8; i <= 8; i++) {
      const u = (i + (j & 1) * 0.5) * SKYLIGHT_SPACING;
      const v = j * SKYLIGHT_SPACING;
      const p = at(u, v);
      if (!pointInRing(p, outline) || distanceToRing(p, outline) < SKYLIGHT_MARGIN) continue;
      if (others.some((b) => pointInRing(p, b.footprint))) continue;
      const corners = [at(u - half, v - half), at(u + half, v - half), at(u + half, v + half), at(u - half, v + half)];
      result.push({
        ...deck,
        id: `${deck.id}-lucernari-${result.length}`,
        name: "Lucernari",
        label: undefined,
        footprint: withOrientation(corners.map(rp), true),
        holes: [],
        baseY: deckY,
        footY: deckY,
        height: SKYLIGHT_HEIGHT,
        minHeight: 0,
        levels: 1,
        color: "#9db8b3",
        roofColor: "#dfe3df",
        interior: undefined,
        entrances: [],
      });
    }
  }
  return result;
}
