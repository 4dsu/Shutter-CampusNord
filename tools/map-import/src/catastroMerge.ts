import { type BuildingData, type Vec2, area, centroid, pointInRing, resamplePolyline } from "@shutter/shared/map";
import type { CatastroPart } from "./catastro.ts";

const r2 = (v: number): number => Math.round(v * 100) / 100;
const rp = (p: Vec2): Vec2 => [r2(p[0]), r2(p[1])];
const baseIdOf = (id: string): string => id.replace(/-p\d+$/, "");

export interface MergeResult {
  buildings: BuildingData[];
  report: string[];
}

/**
 * Substitueix la geometria dels edificis del campus (OSM) per les parts del Cadastre, que tenen contorns oficials
 * i el nombre real de plantes. D'OSM es conserven el nom, el rètol, l'estil, l'interior i les entrades.
 *
 * - Parts amb 0 plantes sobre rasant (soterranis): l'edifici d'OSM que hi coincideix desapareix
 *   (p. ex. el Poliesportiu, que és sota la plaça).
 * - Edificis d'OSM sense cap part del Cadastre: es mantenen tal com són.
 * - Parts del Cadastre sense edifici d'OSM: s'afegeixen sense nom.
 */
export function mergeCatastroBuildings(
  osmBuildings: BuildingData[],
  parts: CatastroPart[],
  playArea: Vec2[],
  heightAt: (p: Vec2) => number,
  floorHeight: (b: BuildingData) => number,
): MergeResult {
  const campus = osmBuildings.filter((b) => !b.background);
  const groups = new Map<string, BuildingData[]>();
  for (const b of campus) {
    const id = baseIdOf(b.id);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)!.push(b);
  }

  const matched = new Map<string, CatastroPart[]>();
  const unmatched: CatastroPart[] = [];
  for (const part of parts) {
    const c = centroid(part.outer);
    if (!pointInRing(c, playArea)) continue;
    let owner: string | undefined;
    for (const [id, members] of groups) {
      if (members.some((m) => pointInRing(c, m.footprint))) {
        owner = id;
        break;
      }
    }
    // Si el centroide cau fora, s'accepta l'edifici que conté la majoria dels vèrtexs de la part.
    if (!owner) {
      let best = 0;
      for (const [id, members] of groups) {
        const inside = part.outer.filter((p) => members.some((m) => pointInRing(p, m.footprint))).length / part.outer.length;
        if (inside > 0.5 && inside > best) {
          best = inside;
          owner = id;
        }
      }
    }
    if (owner) {
      if (!matched.has(owner)) matched.set(owner, []);
      matched.get(owner)!.push(part);
    } else {
      unmatched.push(part);
    }
  }

  const perimeterStats = (ring: Vec2[]): { median: number; min: number } => {
    const hs = resamplePolyline([...ring, ring[0]], 1).map(heightAt).sort((a, b) => a - b);
    return { median: hs[Math.floor(hs.length / 2)], min: hs[0] };
  };

  const result: BuildingData[] = osmBuildings.filter((b) => b.background);
  const report: string[] = [];

  for (const [id, members] of groups) {
    const cat = matched.get(id);
    const osmLevels = Math.max(...members.map((m) => m.levels));
    const osmArea = members.reduce((s, m) => s + area(m.footprint), 0);
    if (!cat) {
      result.push(...members);
      report.push(`${id.padEnd(16)} sense dades del Cadastre: es manté OSM (${osmLevels} pl.)`);
      continue;
    }
    const visible = cat.filter((p) => p.floorsAbove > 0).sort((a, b) => area(b.outer) - area(a.outer));
    if (visible.length === 0) {
      const below = Math.max(...cat.map((p) => p.floorsBelow));
      report.push(`${id.padEnd(16)} SOTERRANI al Cadastre (0 plantes sobre rasant, ${below} sota): s'elimina (OSM deia ${osmLevels} pl.)`);
      continue;
    }
    const template = members.reduce((a, b) => (area(b.footprint) > area(a.footprint) ? b : a));
    const catArea = visible.reduce((s, p) => s + area(p.outer), 0);
    const maxFloors = Math.max(...visible.map((p) => p.floorsAbove));
    const shift = Math.hypot(...([0, 1] as const).map((k) => centroid(template.footprint)[k] - centroid(visible[0].outer)[k]));
    report.push(
      `${id.padEnd(16)} OSM ${String(osmLevels).padStart(2)} pl. ${osmArea.toFixed(0).padStart(5)} m² → Cadastre ${String(maxFloors).padStart(2)} pl. ` +
        `${catArea.toFixed(0).padStart(5)} m² en ${visible.length} parts · desplaçament ${shift.toFixed(1)} m`,
    );
    const floorH = floorHeight(template);
    visible.forEach((p, i) => {
      const stats = perimeterStats(p.outer);
      result.push({
        ...template,
        id: i === 0 ? id : `${id}-p${i}`,
        label: i === 0 ? template.label : undefined,
        interior: i === 0 ? template.interior : undefined,
        entrances: i === 0 ? members.flatMap((m) => m.entrances) : [],
        footprint: p.outer.map(rp),
        holes: p.holes.map((h) => h.map(rp)),
        levels: p.floorsAbove,
        height: r2(p.floorsAbove * floorH),
        minHeight: 0,
        // Totes les parts comparteixen la planta baixa de l'edifici; les parets baixen fins al punt més baix.
        footY: r2(Math.min(template.baseY, stats.min - 0.5)),
      });
    });
  }

  let extra = 0;
  for (const p of unmatched) {
    if (p.floorsAbove === 0) continue;
    const stats = perimeterStats(p.outer);
    result.push({
      id: `cad-${p.id}`,
      osmId: 0,
      name: "",
      kind: "university",
      footprint: p.outer.map(rp),
      holes: p.holes.map((h) => h.map(rp)),
      baseY: r2(stats.median),
      footY: r2(stats.min - 0.5),
      height: r2(p.floorsAbove * 3.6),
      minHeight: 0,
      levels: p.floorsAbove,
      color: "#cfc9be",
      facade: "strips",
      roofColor: "#8f8c86",
      background: false,
      entrances: [],
    });
    extra++;
  }
  report.push(`+ ${extra} volums del Cadastre sense edifici a OSM`);
  return { buildings: result, report };
}
