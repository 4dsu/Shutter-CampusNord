import {
  type AreaData,
  type AreaKind,
  type BuildingData,
  type BuildingKind,
  type Entrance,
  type EntranceKind,
  type FacadeStyle,
  type MapCorrections,
  type MapData,
  type PathData,
  type PathKind,
  type PropData,
  type PropKind,
  type Vec2,
  type WallData,
  type WallKind,
  MAP_FORMAT_VERSION,
  area,
  bounds,
  centroid,
  cleanRing,
  distanceToSegment,
  encodeHeightsCm,
  hash01,
  pointInRing,
  resamplePolyline,
  withOrientation,
} from "@shutter/shared/map";
import type { CatastroPart } from "./catastro.ts";
import { mergeCatastroBuildings } from "./catastroMerge.ts";
import { applyBuildingCorrections, applyPlatforms } from "./corrections.ts";
import { type Dem, sampleDem } from "./dem.ts";
import { type OsmIndex, type OsmWay, type Tags, isClosedWay, parseNumber } from "./osm.ts";
import { BUILDING_OVERRIDES, CAMPUS_GRID_STYLE } from "./overrides.ts";

export const CAMPUS_RELATION_ID = 19836574;

export interface Frame {
  zone: number;
  e0: number;
  n0: number;
  origin: { lat: number; lon: number };
}

export interface GridSpec {
  originX: number;
  originZ: number;
  cellSize: number;
  cols: number;
  rows: number;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;
const rp = (p: Vec2): Vec2 => [r2(p[0]), r2(p[1])];

/** Anell exterior més gran de la relació del campus: és el límit jugable. */
export function campusPlayArea(osm: OsmIndex): Vec2[] {
  const rel = osm.relations.get(CAMPUS_RELATION_ID);
  if (!rel) throw new Error(`No s'ha trobat la relació del Campus Nord (${CAMPUS_RELATION_ID}) a les dades OSM`);
  const rings = osm
    .multipolygon(rel)
    .outers.map((ids) => osm.points(ids))
    .filter((r): r is Vec2[] => !!r)
    .map((r) => withOrientation(cleanRing(r), true));
  if (rings.length === 0) throw new Error("La relació del campus no té cap anell complet");
  rings.sort((a, b) => area(b) - area(a));
  return rings[0];
}

// ---------------------------------------------------------------------------------------------
// Terreny

export interface TerrainResult {
  datum: number;
  heights: Float32Array; // relatives al datum
}

export function sampleTerrain(dem: Dem, frame: Frame, grid: GridSpec): TerrainResult {
  const abs = new Float32Array(grid.cols * grid.rows);
  let min = Infinity;
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const x = grid.originX + c * grid.cellSize;
      const z = grid.originZ + r * grid.cellSize;
      const h = sampleDem(dem, frame.e0 + x, frame.n0 - z);
      abs[r * grid.cols + c] = h;
      if (h < min) min = h;
    }
  }
  const datum = Math.floor(min) - 1;
  const heights = abs.map((h) => h - datum);
  return { datum, heights };
}

/** Alçada interpolada sobre la graella (mateixa triangulació que TerrainField.heightAt). */
export function makeHeightAt(grid: GridSpec, heights: Float32Array): (p: Vec2) => number {
  return ([x, z]) => {
    const gx = (x - grid.originX) / grid.cellSize;
    const gz = (z - grid.originZ) / grid.cellSize;
    const c = Math.max(0, Math.min(grid.cols - 2, Math.floor(gx)));
    const r = Math.max(0, Math.min(grid.rows - 2, Math.floor(gz)));
    const fx = Math.max(0, Math.min(1, gx - c));
    const fz = Math.max(0, Math.min(1, gz - r));
    const h00 = heights[r * grid.cols + c];
    const h10 = heights[r * grid.cols + c + 1];
    const h01 = heights[(r + 1) * grid.cols + c];
    const h11 = heights[(r + 1) * grid.cols + c + 1];
    return fz >= fx ? h00 + fz * (h01 - h00) + fx * (h11 - h01) : h00 + fx * (h10 - h00) + fz * (h11 - h10);
  };
}

// ---------------------------------------------------------------------------------------------
// Edificis

const FLOOR_HEIGHT: Record<BuildingKind, number> = {
  university: 3.8,
  office: 3.4,
  dormitory: 3.0,
  sports: 4.5,
  public: 3.4,
  residential: 3.0,
  other: 3.2,
};

const DEFAULT_LEVELS: Record<BuildingKind, number> = {
  university: 3,
  office: 4,
  dormitory: 5,
  sports: 2,
  public: 4,
  residential: 6,
  other: 3,
};

const KIND_COLORS: Record<BuildingKind, string[]> = {
  university: ["#d3ccbf", "#cbc4b6", "#d8d1c3"],
  office: ["#d6d3cd", "#c9c6bf", "#dcd6cb"],
  dormitory: ["#c79a7d", "#bf8f71"],
  sports: ["#c9c3b6"],
  public: ["#d9cdb8", "#cfc3ae"],
  residential: ["#d9c8ae", "#cdb89c", "#e0d3bf", "#c4ad92", "#d5c2a8"],
  other: ["#cfc9be", "#c6c0b4"],
};

const KIND_FACADES: Record<BuildingKind, FacadeStyle> = {
  university: "strips",
  office: "strips",
  dormitory: "punched",
  sports: "strips",
  public: "punched",
  residential: "punched",
  other: "strips",
};

const ROOF_COLORS = ["#8f8c86", "#9a8f84", "#a37d66", "#8a8781"];

const SKIPPED_BUILDINGS = new Set(["bridge", "ruins", "no", "construction_site"]);

function buildingKind(tags: Tags): BuildingKind {
  const b = tags.building ?? tags["building:part"] ?? "";
  if (["university", "college", "school", "kindergarten"].includes(b)) return "university";
  if (["office", "commercial", "retail", "industrial", "warehouse"].includes(b)) return "office";
  if (b === "dormitory") return "dormitory";
  if (["stadium", "sports_hall", "sports_centre", "grandstand"].includes(b)) return "sports";
  if (["public", "civic", "government", "hospital", "church", "chapel"].includes(b)) return "public";
  if (["residential", "apartments", "house", "detached", "terrace", "semidetached_house"].includes(b)) return "residential";
  return "other";
}

const ENTRANCE_KINDS: Record<string, EntranceKind> = { main: "main", secondary: "secondary", service: "service" };

interface RawBuilding {
  osmId: number;
  tags: Tags;
  outer: Vec2[];
  holes: Vec2[][];
  entrances: Entrance[];
}

function heightsFromTags(tags: Tags, kind: BuildingKind, levelsOverride?: number, heightOverride?: number) {
  const floor = FLOOR_HEIGHT[kind];
  const levels = levelsOverride ?? parseNumber(tags["building:levels"]) ?? DEFAULT_LEVELS[kind];
  const height = heightOverride ?? parseNumber(tags.height) ?? Math.max(1, levels) * floor;
  const minLevel = parseNumber(tags["building:min_level"]);
  const minHeight = parseNumber(tags.min_height) ?? (minLevel !== undefined ? minLevel * floor : 0);
  return { levels: Math.max(1, Math.round(levels)), height, minHeight: Math.min(minHeight, height - 0.3) };
}

function wayEntrances(osm: OsmIndex, way: OsmWay): Entrance[] {
  const out: Entrance[] = [];
  for (const id of way.nodes) {
    const n = osm.nodes.get(id);
    const e = n?.tags?.entrance;
    if (!n || !e) continue;
    const pos = osm.nodePos(id)!;
    if (out.some((o) => o.pos[0] === pos[0] && o.pos[1] === pos[1])) continue;
    out.push({ pos: rp(pos), kind: ENTRANCE_KINDS[e] ?? "other" });
  }
  return out;
}

function collectRawBuildings(osm: OsmIndex, tagKey: "building" | "building:part"): RawBuilding[] {
  const out: RawBuilding[] = [];
  for (const way of osm.ways.values()) {
    const t = way.tags;
    if (!t?.[tagKey] || !isClosedWay(way)) continue;
    if (tagKey === "building" && SKIPPED_BUILDINGS.has(t.building)) continue;
    const pts = osm.points(way.nodes);
    if (!pts) continue;
    const outer = cleanRing(pts);
    if (outer.length < 3 || area(outer) < 4) continue;
    out.push({ osmId: way.id, tags: t, outer: withOrientation(outer, true), holes: [], entrances: wayEntrances(osm, way) });
  }
  for (const rel of osm.relations.values()) {
    const t = rel.tags;
    if (!t?.[tagKey] || t.type !== "multipolygon") continue;
    if (tagKey === "building" && SKIPPED_BUILDINGS.has(t.building)) continue;
    const { outers, inners } = osm.multipolygon(rel);
    const innerRings = inners.map((ids) => osm.points(ids)).filter((r): r is Vec2[] => !!r);
    for (const ids of outers) {
      const pts = osm.points(ids);
      if (!pts) continue;
      const outer = withOrientation(cleanRing(pts), true);
      if (outer.length < 3 || area(outer) < 4) continue;
      const holes = innerRings
        .filter((h) => pointInRing(centroid(h), outer))
        .map((h) => withOrientation(cleanRing(h), false))
        .filter((h) => h.length >= 3);
      out.push({ osmId: rel.id, tags: t, outer, holes, entrances: [] });
    }
  }
  return out;
}

export interface BuildContext {
  osm: OsmIndex;
  grid: GridSpec;
  heights: Float32Array;
  playArea: Vec2[];
}

function inGrid(ctx: BuildContext, p: Vec2, margin = 0): boolean {
  const { originX, originZ, cellSize, cols, rows } = ctx.grid;
  return (
    p[0] >= originX + margin &&
    p[1] >= originZ + margin &&
    p[0] <= originX + (cols - 1) * cellSize - margin &&
    p[1] <= originZ + (rows - 1) * cellSize - margin
  );
}

export function extractBuildings(ctx: BuildContext): BuildingData[] {
  const heightAt = makeHeightAt(ctx.grid, ctx.heights);
  const outlines = collectRawBuildings(ctx.osm, "building").filter((b) => b.outer.every((p) => inGrid(ctx, p, 1)));
  const parts = collectRawBuildings(ctx.osm, "building:part").filter((b) => b.outer.every((p) => inGrid(ctx, p, 1)));

  // Assigna cada part a l'edifici que conté el seu centroide.
  const partsOf = new Map<RawBuilding, RawBuilding[]>();
  for (const part of parts) {
    const c = centroid(part.outer);
    const parent = outlines.find((o) => pointInRing(c, o.outer));
    if (!parent) continue;
    if (!partsOf.has(parent)) partsOf.set(parent, []);
    partsOf.get(parent)!.push(part);
  }

  const result: BuildingData[] = [];
  for (const b of outlines) {
    const ov = BUILDING_OVERRIDES[b.osmId] ?? {};
    const kind = ov.kind ?? buildingKind(b.tags);
    const name = ov.name ?? b.tags.name ?? b.tags["addr:housename"] ?? "";
    const id = ov.id ?? `osm-${b.osmId}`;
    const label = ov.label ?? (/^[A-D]\d$/.test(name) ? name : undefined);
    const gridBuilding = /^[A-D]\d$/.test(id);
    const palette = gridBuilding ? CAMPUS_GRID_STYLE.colors : KIND_COLORS[kind];
    const color = ov.color ?? palette[Math.floor(hash01(b.osmId) * palette.length)];
    const facade: FacadeStyle = ov.facade ?? (gridBuilding ? CAMPUS_GRID_STYLE.facade : KIND_FACADES[kind]);
    const roofColor =
      ov.roofColor ?? (gridBuilding ? CAMPUS_GRID_STYLE.roofColor : ROOF_COLORS[Math.floor(hash01(b.osmId * 13 + 5) * ROOF_COLORS.length)]);
    const background = !pointInRing(centroid(b.outer), ctx.playArea);

    // Cota de la planta baixa: l'entrada principal si n'hi ha; si no, la mediana del terreny al perímetre.
    const perimeter = resamplePolyline([...b.outer, b.outer[0]], 1).map(heightAt);
    const sorted = perimeter.slice().sort((x, y) => x - y);
    const main = b.entrances.find((e) => e.kind === "main");
    const baseY = main ? heightAt(main.pos) : sorted[Math.floor(sorted.length / 2)];
    const footY = sorted[0] - 0.5;

    const myParts = partsOf.get(b) ?? [];
    const partArea = myParts.reduce((s, p) => s + area(p.outer), 0);
    const useParts = myParts.length > 0 && partArea >= 0.7 * area(b.outer);

    const common = {
      osmId: b.osmId,
      name,
      kind,
      color,
      facade,
      roofColor,
      background,
      baseY: r2(baseY),
      footY: r2(Math.min(footY, baseY)),
    };
    if (!useParts) {
      const h = heightsFromTags(b.tags, kind, ov.levels, ov.height);
      result.push({
        ...common,
        id,
        label,
        footprint: b.outer.map(rp),
        holes: b.holes.map((hole) => hole.map(rp)),
        height: r2(h.height),
        minHeight: r2(h.minHeight),
        levels: h.levels,
        interior: ov.interior,
        entrances: b.entrances,
      });
      continue;
    }

    // Edifici descrit per parts (alçades diferents): cada part és un volum; el rètol va a la més gran.
    const largest = myParts.reduce((best, p) => (area(p.outer) > area(best.outer) ? p : best), myParts[0]);
    myParts.forEach((p, i) => {
      const h = heightsFromTags(p.tags, kind, p === largest ? ov.levels : undefined);
      result.push({
        ...common,
        id: `${id}-p${i}`,
        label: p === largest ? label : undefined,
        footprint: p.outer.map(rp),
        holes: p.holes.map((hole) => hole.map(rp)),
        height: r2(h.height),
        minHeight: r2(h.minHeight),
        levels: h.levels,
        interior: p === largest ? ov.interior : undefined,
        entrances: p === largest ? b.entrances : [],
      });
    });
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Zones, camins i murs

function areaKind(t: Tags): AreaKind | undefined {
  if (t.building || t["building:part"]) return undefined;
  if (
    t.natural === "water" ||
    t.water ||
    t.amenity === "fountain" ||
    t.leisure === "swimming_pool" ||
    t.landuse === "basin" ||
    t.landuse === "reservoir"
  )
    return "water";
  if (t.landuse === "flowerbed" || t.man_made === "planter") return "flowerbed";
  if (t.leisure === "pitch" || t.leisure === "track") return "pitch";
  if (t.amenity === "parking" || t.landuse === "garages") return "parking";
  const ah = t["area:highway"];
  if (ah) return ["footway", "pedestrian", "steps", "path", "cycleway", "platform", "corridor"].includes(ah) ? "paving" : "asphalt";
  if ((t.highway === "pedestrian" || t.highway === "footway") && t.area === "yes") return "paving";
  if (t.place === "square" || t.man_made === "reservoir_covered") return "paving";
  if (
    ["grass", "meadow", "village_green", "recreation_ground"].includes(t.landuse) ||
    ["park", "garden", "dog_park"].includes(t.leisure) ||
    ["grassland", "scrub", "heath"].includes(t.natural)
  )
    return "grass";
  if (t.natural === "wood" || t.landuse === "forest") return "wood";
  if (t.landuse === "construction" || t.natural === "sand" || t.natural === "bare_rock") return "dirt";
  return undefined;
}

function overlapsGrid(ctx: BuildContext, pts: Vec2[]): boolean {
  const b = bounds(pts);
  const { originX, originZ, cellSize, cols, rows } = ctx.grid;
  return !(
    b.maxX < originX ||
    b.maxZ < originZ ||
    b.minX > originX + (cols - 1) * cellSize ||
    b.minZ > originZ + (rows - 1) * cellSize
  );
}

export function extractAreas(ctx: BuildContext): AreaData[] {
  const { osm } = ctx;
  const out: AreaData[] = [];
  for (const way of osm.ways.values()) {
    const kind = way.tags && isClosedWay(way) ? areaKind(way.tags) : undefined;
    if (!kind) continue;
    const pts = osm.points(way.nodes);
    if (!pts || !overlapsGrid(ctx, pts)) continue;
    const ring = cleanRing(pts);
    if (ring.length >= 3) out.push({ kind, ring: withOrientation(ring, true).map(rp), holes: [] });
  }
  for (const rel of osm.relations.values()) {
    const kind = rel.tags?.type === "multipolygon" ? areaKind(rel.tags) : undefined;
    if (!kind) continue;
    const { outers, inners } = osm.multipolygon(rel);
    const innerRings = inners.map((ids) => osm.points(ids)).filter((r): r is Vec2[] => !!r);
    for (const ids of outers) {
      const pts = osm.points(ids);
      if (!pts || !overlapsGrid(ctx, pts)) continue;
      const ring = withOrientation(cleanRing(pts), true);
      const holes = innerRings.filter((h) => pointInRing(centroid(h), ring)).map((h) => withOrientation(cleanRing(h), false));
      out.push({ kind, ring: ring.map(rp), holes: holes.map((h) => h.map(rp)) });
    }
  }
  return out;
}

function pathKind(t: Tags): [PathKind, number] | undefined {
  if (t.area === "yes" || t.bridge === "yes") return undefined;
  switch (t.highway) {
    case "footway":
    case "corridor":
    case "bridleway":
      return ["footway", 2.5];
    case "path":
      return ["path", 1.8];
    case "steps":
      return ["steps", 3];
    case "pedestrian":
      return ["pedestrian", 6];
    case "cycleway":
      return ["cycleway", 2.5];
    case "service":
    case "track":
    case "living_street":
      return ["service", 5];
    case "residential":
    case "unclassified":
    case "tertiary":
    case "tertiary_link":
      return ["street", 8];
    case "secondary":
    case "secondary_link":
      return ["street", 12];
    case "primary":
    case "primary_link":
    case "trunk":
    case "trunk_link":
      return ["street", 16];
    default:
      return undefined;
  }
}

export function extractPaths(ctx: BuildContext): PathData[] {
  const out: PathData[] = [];
  for (const way of ctx.osm.ways.values()) {
    const pk = way.tags ? pathKind(way.tags) : undefined;
    if (!pk) continue;
    const pts = ctx.osm.points(way.nodes);
    if (!pts || pts.length < 2 || !overlapsGrid(ctx, pts)) continue;
    const width = parseNumber(way.tags!.width) ?? pk[1];
    out.push({ kind: pk[0], points: pts.map(rp), width: Math.max(1, Math.min(30, width)) });
  }
  return out;
}

function wallSpec(t: Tags): { kind: WallKind; height: number; thickness: number } | undefined {
  switch (t.barrier) {
    case "wall":
    case "city_wall":
      return { kind: "wall", height: parseNumber(t.height) ?? 1.6, thickness: 0.3 };
    case "retaining_wall":
      return { kind: "retaining", height: 1.0, thickness: 0.4 };
    case "fence":
      return { kind: "fence", height: parseNumber(t.height) ?? 1.8, thickness: 0.08 };
    case "guard_rail":
      return { kind: "fence", height: 1.0, thickness: 0.08 };
    case "hedge":
      return { kind: "hedge", height: parseNumber(t.height) ?? 1.3, thickness: 0.9 };
  }
  if (t.man_made === "planter") return { kind: "planter", height: 0.5, thickness: 0.3 };
  return undefined;
}

export function extractWalls(ctx: BuildContext): WallData[] {
  const out: WallData[] = [];
  for (const way of ctx.osm.ways.values()) {
    const spec = way.tags ? wallSpec(way.tags) : undefined;
    if (!spec) continue;
    const pts = ctx.osm.points(way.nodes);
    if (!pts || pts.length < 2 || !pts.every((p) => inGrid(ctx, p))) continue;
    const closed = isClosedWay(way);
    const points = closed ? pts.slice(0, -1) : pts;
    out.push({ ...spec, points: points.map(rp), closed });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Objectes (arbres, fanals, bancs...)

const PALM_GENERA = ["phoenix", "washingtonia", "chamaerops", "trachycarpus", "butia", "syagrus"];
const CONIFER_GENERA = ["pinus", "cupressus", "cedrus", "abies", "picea", "taxus", "juniperus", "cupressocyparis"];

function treeKind(t: Tags): PropKind {
  const taxon = `${t.genus ?? ""} ${t.species ?? ""} ${t.taxon ?? ""} ${t["species:wikidata"] ?? ""}`.toLowerCase();
  if (PALM_GENERA.some((g) => taxon.includes(g)) || t.leaf_type === "palm") return "palm";
  if (t.leaf_type === "needleleaved" || CONIFER_GENERA.some((g) => taxon.includes(g))) return "conifer";
  return "tree";
}

function nodePropKind(t: Tags): PropKind | undefined {
  if (t.natural === "tree") return treeKind(t);
  if (t.natural === "shrub") return "shrub";
  if (t.highway === "street_lamp") return "lamp";
  if (t.amenity === "bench") return "bench";
  if (t.leisure === "picnic_table") return "picnic_table";
  if (t.amenity === "waste_basket") return "waste_basket";
  if (t.amenity === "bicycle_parking") return "bicycle_parking";
  if (t.man_made === "planter") return "planter";
  if (t.amenity === "drinking_water" || t.amenity === "water_point" || t.man_made === "water_tap") return "drinking_water";
  if (t.amenity === "vending_machine") return "vending_machine";
  return undefined;
}

/** Angle de rotació (y) perquè l'objecte, modelat mirant cap a +z, miri en la direcció OSM (graus des del nord). */
function osmDirectionToRot(direction: string | undefined): number | undefined {
  const deg = parseNumber(direction);
  if (deg === undefined) return undefined;
  return Math.PI - (deg * Math.PI) / 180;
}

export function extractProps(ctx: BuildContext, paths: PathData[]): PropData[] {
  const { osm } = ctx;
  const out: PropData[] = [];
  const segments: [Vec2, Vec2][] = [];
  for (const p of paths) {
    if (p.kind === "street") continue;
    for (let i = 1; i < p.points.length; i++) segments.push([p.points[i - 1], p.points[i]]);
  }
  /** Orienta l'objecte (modelat mirant cap a +z) perquè miri cap al camí més proper. */
  const alignToPath = (pos: Vec2): number => {
    let best = Infinity;
    let rot = 0;
    for (const [a, b] of segments) {
      const d = distanceToSegment(pos, a, b);
      if (d >= best) continue;
      best = d;
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((pos[0] - a[0]) * dx + (pos[1] - a[1]) * dz) / len2));
      const fx = a[0] + t * dx - pos[0];
      const fz = a[1] + t * dz - pos[1];
      // Si és just a sobre del camí, perpendicular al tram.
      rot = d > 0.2 ? Math.atan2(fx, fz) : Math.atan2(dx, dz) + Math.PI / 2;
    }
    return best < 12 ? rot : 0;
  };

  const push = (kind: PropKind, pos: Vec2, id: number, tags: Tags): void => {
    if (!inGrid(ctx, pos, 1)) return;
    let scale = 1;
    if (kind === "tree" || kind === "palm" || kind === "conifer") {
      const h = parseNumber(tags.height) ?? 7 + hash01(id) * 6;
      scale = Math.max(0.35, Math.min(2.5, h / 10));
    } else if (kind === "shrub") {
      scale = 0.8 + hash01(id) * 0.5;
    }
    const needsAlign = kind === "bench" || kind === "picnic_table" || kind === "bicycle_parking" || kind === "vending_machine";
    const rot = osmDirectionToRot(tags.direction) ?? (needsAlign ? alignToPath(pos) : hash01(id * 7 + 3) * Math.PI * 2);
    out.push({ kind, pos: rp(pos), rot: Math.round(rot * 1000) / 1000, scale: Math.round(scale * 100) / 100 });
  };

  for (const n of osm.nodes.values()) {
    const kind = n.tags ? nodePropKind(n.tags) : undefined;
    if (kind) push(kind, osm.nodePos(n.id)!, n.id, n.tags!);
  }

  for (const way of osm.ways.values()) {
    const t = way.tags;
    if (!t) continue;
    const pts = osm.points(way.nodes);
    if (!pts) continue;
    if (t.natural === "tree_row") {
      resamplePolyline(pts, 7).forEach((p, i) => push(treeKind(t), p, way.id * 31 + i, t));
    } else if (t.amenity === "bench" && !isClosedWay(way)) {
      // Banc llarg dibuixat com a línia: un banc cada 2,2 m orientat segons el tram.
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const rot = Math.atan2(b[0] - a[0], b[1] - a[1]) + Math.PI / 2;
        for (const p of resamplePolyline([a, b], 2.2)) {
          if (inGrid(ctx, p, 1)) out.push({ kind: "bench", pos: rp(p), rot: Math.round(rot * 1000) / 1000, scale: 1 });
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------

export interface BuildInput {
  osm: OsmIndex;
  dem: Dem;
  frame: Frame;
  grid: GridSpec;
  playArea: Vec2[];
  catastro: CatastroPart[];
  corrections: MapCorrections;
  /** Línies de l'informe OSM ↔ Cadastre (s'hi afegeixen). */
  report: string[];
}

export function buildMap({ osm, dem, frame, grid, playArea, catastro, corrections, report }: BuildInput): MapData {
  const terrain = sampleTerrain(dem, frame, grid);
  // Les places i terrasses corregides s'aplanen abans de calcular la base dels edificis.
  applyPlatforms(grid, terrain.heights, terrain.datum, corrections);
  const heightAt = makeHeightAt(grid, terrain.heights);
  const ctx: BuildContext = { osm, grid, heights: terrain.heights, playArea };
  const floorHeight = (b: BuildingData): number => FLOOR_HEIGHT[b.kind];
  const merged = mergeCatastroBuildings(extractBuildings(ctx), catastro, playArea, heightAt, floorHeight);
  report.push(...merged.report);
  const buildings = applyBuildingCorrections(merged.buildings, corrections, heightAt, floorHeight);
  const areas = extractAreas(ctx);
  const paths = extractPaths(ctx);
  const walls = extractWalls(ctx);
  const props = extractProps(ctx, paths);
  return {
    format: MAP_FORMAT_VERSION,
    name: "Campus Nord (UPC)",
    origin: { lat: frame.origin.lat, lon: frame.origin.lon, utmZone: frame.zone, easting: frame.e0, northing: frame.n0 },
    datum: terrain.datum,
    attribution: [
      "Dades de mapa © OpenStreetMap contributors (ODbL) — openstreetmap.org/copyright",
      "Model d'elevacions del terreny © Institut Cartogràfic i Geològic de Catalunya (CC BY 4.0)",
      "Edificis del campus: Dirección General del Catastro (INSPIRE)",
    ],
    playArea: playArea.map(rp),
    terrain: {
      originX: grid.originX,
      originZ: grid.originZ,
      cellSize: grid.cellSize,
      cols: grid.cols,
      rows: grid.rows,
      heightsCm: encodeHeightsCm(terrain.heights),
    },
    buildings,
    areas,
    paths,
    walls,
    props,
  };
}

