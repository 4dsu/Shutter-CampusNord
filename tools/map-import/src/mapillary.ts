/**
 * Cobertura de Mapillary (fotos de carrer CC BY-SA 4.0) dins del Campus Nord.
 *
 *   MAPILLARY_TOKEN=... node tools/map-import/src/mapillary.ts
 *   (o posa MAPILLARY_TOKEN=... a .env.local, que no es puja al repositori)
 *
 * Escriu un informe per edifici: quantes fotos hi ha a menys de 40 m i que hi apunten.
 */
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { type MapData, type Vec2, centroid, distanceToSegment, pointInRing } from "@shutter/shared/map";
import { latLonToUtm } from "./projection.ts";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const envFile = `${ROOT}.env.local`;
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const TOKEN = process.env.MAPILLARY_TOKEN;
if (!TOKEN) {
  console.error("Falta MAPILLARY_TOKEN (crea'l a https://www.mapillary.com/dashboard/developers i posa'l a .env.local).");
  process.exit(1);
}

const map = JSON.parse(readFileSync(`${ROOT}assets/maps/campus-nord.json`, "utf8")) as MapData;
const { lat, lon, utmZone, easting, northing } = map.origin;
void lat;
void lon;
const toLocal = (la: number, lo: number): Vec2 => {
  const u = latLonToUtm(la, lo, utmZone);
  return [u.easting - easting, northing - u.northing];
};

interface Img {
  id: string;
  geometry: { coordinates: [number, number] };
  compass_angle?: number;
  captured_at?: number;
  is_pano?: boolean;
  creator?: { username: string };
}

// Mapillary limita el bbox a zones petites: es divideix en cel·les de ~0,002°.
const bbox = { minLon: 2.1085, minLat: 41.387, maxLon: 2.1185, maxLat: 41.3915 };
const step = 0.002;
const images = new Map<string, Img>();
for (let lo = bbox.minLon; lo < bbox.maxLon; lo += step) {
  for (let la = bbox.minLat; la < bbox.maxLat; la += step) {
    const b = [lo, la, Math.min(lo + step, bbox.maxLon), Math.min(la + step, bbox.maxLat)].map((v) => v.toFixed(5)).join(",");
    const url = `https://graph.mapillary.com/images?access_token=${TOKEN}&fields=id,geometry,compass_angle,captured_at,is_pano,creator&bbox=${b}&limit=2000`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mapillary HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { data: Img[] };
    for (const img of data.data) images.set(img.id, img);
  }
}

const inside = [...images.values()].map((img) => ({ img, p: toLocal(img.geometry.coordinates[1], img.geometry.coordinates[0]) }));
const inCampus = inside.filter((x) => pointInRing(x.p, map.playArea));
console.log(`Fotos a la zona: ${inside.length} · dins del campus: ${inCampus.length} · panoràmiques: ${inCampus.filter((x) => x.img.is_pano).length}`);
const years = new Map<number, number>();
for (const x of inCampus) if (x.img.captured_at) {
  const y = new Date(x.img.captured_at).getFullYear();
  years.set(y, (years.get(y) ?? 0) + 1);
}
console.log("Per any:", [...years].sort().map(([y, n]) => `${y}: ${n}`).join(", "));

// Per edifici: fotos a < 40 m que miren cap a l'edifici (±60°) o panoràmiques.
const lines: string[] = [];
for (const b of map.buildings.filter((x) => !x.background && !/-p\d+$/.test(x.id))) {
  const c = centroid(b.footprint);
  const near = inside.filter(({ img, p }) => {
    const d = Math.min(...b.footprint.map((q, i) => distanceToSegment(p, q, b.footprint[(i + 1) % b.footprint.length])));
    if (d > 40) return false;
    if (img.is_pano || img.compass_angle === undefined) return true;
    // Rumb cap a l'edifici (graus des del nord, sentit horari; nord = −z, est = +x).
    const bearing = ((Math.atan2(c[0] - p[0], -(c[1] - p[1])) * 180) / Math.PI + 360) % 360;
    const diff = Math.abs(((img.compass_angle - bearing + 540) % 360) - 180);
    return diff < 60;
  });
  lines.push(`${b.id.padEnd(16)} ${String(near.length).padStart(4)} fotos${near.length ? `  (p. ex. https://www.mapillary.com/app/?pKey=${near[0].img.id})` : ""}`);
}
lines.sort((a, b) => Number(b.slice(16, 21)) - Number(a.slice(16, 21)));
console.log("\nFotos que apunten a cada edifici (< 40 m):\n" + lines.join("\n"));
await writeFile(
  `${ROOT}tools/map-import/.cache/mapillary.json`,
  JSON.stringify(inside.map(({ img, p }) => ({ ...img, local: p }))),
);
