/**
 * Importador del mapa del Campus Nord.
 *
 *   npm run map:import             → fa servir la cache (tools/map-import/.cache) si existeix
 *   npm run map:import -- --refresh → torna a descarregar OSM i el terreny
 *
 * Fonts: OpenStreetMap (API 0.6) i el model d'elevacions de 5 m de l'ICGC (WCS).
 * Sortida: assets/maps/campus-nord.json
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { type MapData, type Vec2, area, bounds } from "@shutter/shared/map";
import { type Frame, type GridSpec, buildMap, campusPlayArea } from "./build.ts";
import { parseArcGrid } from "./dem.ts";
import { cachedFetchText } from "./fetch.ts";
import { fetchCatastroParts } from "./catastro.ts";
import { ORTHO_LAYER, fetchOrthophoto } from "./orthophoto.ts";
import { OsmIndex, type OsmJson } from "./osm.ts";
import { latLonToUtm } from "./projection.ts";

/** Centre del Campus Nord: origen del sistema de coordenades del joc. */
const ORIGIN = { lat: 41.389012, lon: 2.114145 };
const UTM_ZONE = 31;
/** Zona descarregada d'OSM (inclou els carrers i edificis del voltant). */
const OSM_BBOX = { minLon: 2.106, minLat: 41.385, maxLon: 2.12, maxLat: 41.3935 };
/** Resolució de la graella del terreny del joc (m). */
const CELL_SIZE = 2;
/** Marge de terreny al voltant del límit jugable (m). */
const TERRAIN_MARGIN = 120;
const DEM_CELL = 5;

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CACHE_DIR = `${ROOT}tools/map-import/.cache/`;
const OUT_FILE = `${ROOT}assets/maps/campus-nord.json`;
const ORTHO_FILE = "campus-nord-orto.jpg";
/** Dades de referència per a l'editor del mapa (no les carrega el joc). */
const REFERENCE_FILE = `${ROOT}assets/maps/campus-nord-reference.json`;

async function fetchDem(minE: number, minN: number, maxE: number, maxN: number, refresh: boolean): Promise<string> {
  const width = Math.round((maxE - minE) / DEM_CELL);
  const height = Math.round((maxN - minN) / DEM_CELL);
  const cacheFile = `${CACHE_DIR}met5-${minE}-${minN}-${maxE}-${maxN}.asc`;
  // El servidor de l'ICGC afegeix "5" al nom de la cobertura; es prova primer el nom que hi funciona avui
  // i, si un dia ho corregeixen, el nom real.
  let lastError = "";
  for (const coverage of ["icc:met", "icc:met5"]) {
    const url =
      "https://geoserveis.icgc.cat/icc_mdt/wcs/service?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage" +
      `&COVERAGE=${coverage}&CRS=EPSG:25831&BBOX=${minE},${minN},${maxE},${maxN}` +
      `&WIDTH=${width}&HEIGHT=${height}&FORMAT=ArcGrid`;
    const text = await cachedFetchText(url, cacheFile, refresh);
    if (/^\s*ncols/i.test(text)) return text;
    lastError = text.slice(0, 300);
    refresh = true; // la cache conté un error: cal tornar a baixar
  }
  throw new Error(`El WCS de l'ICGC no ha retornat un ArcGrid:\n${lastError}`);
}

async function main(): Promise<void> {
  const refresh = process.argv.includes("--refresh");
  const origin = latLonToUtm(ORIGIN.lat, ORIGIN.lon, UTM_ZONE);
  const frame: Frame = {
    zone: UTM_ZONE,
    e0: Math.round(origin.easting),
    n0: Math.round(origin.northing),
    origin: ORIGIN,
  };
  const project = (lat: number, lon: number): Vec2 => {
    const u = latLonToUtm(lat, lon, UTM_ZONE);
    return [u.easting - frame.e0, frame.n0 - u.northing];
  };

  console.log("1/6 OpenStreetMap");
  const b = OSM_BBOX;
  const osmText = await cachedFetchText(
    `https://api.openstreetmap.org/api/0.6/map.json?bbox=${b.minLon},${b.minLat},${b.maxLon},${b.maxLat}`,
    `${CACHE_DIR}osm.json`,
    refresh,
  );
  const osm = new OsmIndex(JSON.parse(osmText) as OsmJson, project);
  console.log(`  ${osm.nodes.size} nodes, ${osm.ways.size} vies, ${osm.relations.size} relacions`);

  const playArea = campusPlayArea(osm);
  const pb = bounds(playArea);
  console.log(
    `  límit jugable: ${playArea.length} vèrtexs, ${(pb.maxX - pb.minX).toFixed(0)} × ${(pb.maxZ - pb.minZ).toFixed(0)} m, ` +
      `${(area(playArea) / 10000).toFixed(1)} ha`,
  );

  const originX = Math.floor((pb.minX - TERRAIN_MARGIN) / CELL_SIZE) * CELL_SIZE;
  const originZ = Math.floor((pb.minZ - TERRAIN_MARGIN) / CELL_SIZE) * CELL_SIZE;
  const maxX = Math.ceil((pb.maxX + TERRAIN_MARGIN) / CELL_SIZE) * CELL_SIZE;
  const maxZ = Math.ceil((pb.maxZ + TERRAIN_MARGIN) / CELL_SIZE) * CELL_SIZE;
  const grid: GridSpec = {
    originX,
    originZ,
    cellSize: CELL_SIZE,
    cols: (maxX - originX) / CELL_SIZE + 1,
    rows: (maxZ - originZ) / CELL_SIZE + 1,
  };
  const sw = project(b.minLat, b.minLon);
  const ne = project(b.maxLat, b.maxLon);
  if (originX < sw[0] || maxX > ne[0] || originZ < ne[1] || maxZ > sw[1]) {
    console.warn("  ⚠ La graella del terreny surt de la zona descarregada d'OSM: hi pot faltar decorat a les vores.");
  }

  console.log(`2/6 Terreny ICGC 5 m → graella ${grid.cols} × ${grid.rows} de ${CELL_SIZE} m`);
  const snap = (v: number, up: boolean): number => (up ? Math.ceil(v / DEM_CELL) : Math.floor(v / DEM_CELL)) * DEM_CELL;
  const demText = await fetchDem(
    snap(frame.e0 + originX - 15, false),
    snap(frame.n0 - maxZ - 15, false),
    snap(frame.e0 + maxX + 15, true),
    snap(frame.n0 - originZ + 15, true),
    refresh,
  );
  const dem = parseArcGrid(demText);

  console.log(`3/6 Ortofoto ICGC (${ORTHO_LAYER})`);
  const ortho = await fetchOrthophoto(frame, grid, CACHE_DIR, refresh);
  console.log(`  ${ortho.width} × ${ortho.height} px, ${(ortho.jpeg.length / 1024 / 1024).toFixed(1)} MB`);

  console.log("4/6 Cadastre (parts d'edifici)");
  const catastro = await fetchCatastroParts(
    {
      minE: Math.floor(frame.e0 + pb.minX - 20),
      minN: Math.floor(frame.n0 - pb.maxZ - 20),
      maxE: Math.ceil(frame.e0 + pb.maxX + 20),
      maxN: Math.ceil(frame.n0 - pb.minZ + 20),
    },
    (e, n) => [e - frame.e0, frame.n0 - n],
    CACHE_DIR,
    refresh,
  );
  console.log(`  ${catastro.length} parts en ${new Set(catastro.map((p) => p.ref)).size} parcel·les`);

  console.log("5/6 Generant el mapa");
  const report: string[] = [];
  const map: MapData = buildMap({ osm, dem, frame, grid, playArea, catastro, report });
  console.log("  Informe OSM → Cadastre:");
  for (const line of report) console.log(`   ${line}`);
  map.orthophoto = { file: ORTHO_FILE, width: ortho.width, height: ortho.height };
  map.attribution.push("Ortofoto de Catalunya 25 cm (2025) © Institut Cartogràfic i Geològic de Catalunya (CC BY 4.0)");

  console.log("6/6 Desant");
  await writeFile(`${dirname(OUT_FILE)}/${ORTHO_FILE}`, ortho.jpeg);
  const json = JSON.stringify(map);
  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, json);
  const r2 = (v: number): number => Math.round(v * 100) / 100;
  const ring = (pts: Vec2[]): Vec2[] => pts.map(([x, z]) => [r2(x), r2(z)]);
  await writeFile(
    REFERENCE_FILE,
    JSON.stringify({
      attribution: ["Edificis: Dirección General del Catastro (INSPIRE)"],
      catastro: catastro.map((p) => ({ ...p, outer: ring(p.outer), holes: p.holes.map(ring) })),
    }),
  );
  printSummary(map, json.length);
}

function printSummary(map: MapData, bytes: number): void {
  const count = <T extends { kind: string }>(items: T[]): string =>
    Object.entries(
      items.reduce<Record<string, number>>((acc, it) => {
        acc[it.kind] = (acc[it.kind] ?? 0) + 1;
        return acc;
      }, {}),
    )
      .map(([k, v]) => `${k} ${v}`)
      .join(", ");
  const campus = map.buildings.filter((b) => !b.background);
  console.log(`\n✔ ${OUT_FILE.replace(ROOT, "")} (${(bytes / 1024).toFixed(0)} KB), datum ${map.datum} m`);
  console.log(`  Edificis: ${campus.length} del campus + ${map.buildings.length - campus.length} de decorat`);
  console.log(`  Zones: ${count(map.areas)}`);
  console.log(`  Camins: ${count(map.paths)}`);
  console.log(`  Murs: ${count(map.walls)}`);
  console.log(`  Objectes: ${count(map.props)}`);
  console.log("\n  Edificis del campus:");
  for (const b of campus.sort((x, y) => x.id.localeCompare(y.id))) {
    console.log(
      `   ${b.id.padEnd(14)} ${b.name.slice(0, 34).padEnd(34)} ${String(b.levels).padStart(2)} pl. ` +
        `${b.height.toFixed(1).padStart(5)} m  base ${(b.baseY + map.datum).toFixed(1)} m` +
        `${b.interior ? "  [interior]" : ""}${b.entrances.length ? `  ${b.entrances.length} entrades` : ""}`,
    );
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
