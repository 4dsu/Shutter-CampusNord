import { type Vec2, cleanRing, withOrientation } from "@shutter/shared/map";
import { cachedFetchText } from "./fetch.ts";

/** Part d'edifici del Cadastre (INSPIRE BU): volum amb un nombre de plantes homogeni. */
export interface CatastroPart {
  /** p. ex. "5722901DF2852D_part12". */
  id: string;
  /** Referència cadastral de la parcel·la (agrupa les parts d'un mateix edifici o recinte). */
  ref: string;
  outer: Vec2[];
  holes: Vec2[][];
  floorsAbove: number;
  floorsBelow: number;
}

/**
 * Descarrega les parts d'edifici del Cadastre (WFS INSPIRE, EPSG:25831) dins d'un rectangle UTM
 * i les passa a coordenades locals del joc.
 */
export async function fetchCatastroParts(
  bbox: { minE: number; minN: number; maxE: number; maxN: number },
  toLocal: (e: number, n: number) => Vec2,
  cacheDir: string,
  refresh: boolean,
): Promise<CatastroPart[]> {
  const { minE, minN, maxE, maxN } = bbox;
  const url =
    "https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx?service=WFS&version=2.0.0&request=GetFeature" +
    `&typenames=BU:BuildingPart&srsname=EPSG::25831&bbox=${minE},${minN},${maxE},${maxN}`;
  const gml = await cachedFetchText(url, `${cacheDir}catastro-${minE}-${minN}-${maxE}-${maxN}.gml`, refresh);
  if (!gml.includes("FeatureCollection")) throw new Error(`Resposta inesperada del Cadastre:\n${gml.slice(0, 300)}`);
  return parseBuildingParts(gml, toLocal);
}

function parsePosList(text: string, toLocal: (e: number, n: number) => Vec2): Vec2[] {
  const nums = text.trim().split(/\s+/).map(Number);
  const pts: Vec2[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push(toLocal(nums[i], nums[i + 1]));
  return pts;
}

export function parseBuildingParts(gml: string, toLocal: (e: number, n: number) => Vec2): CatastroPart[] {
  const parts: CatastroPart[] = [];
  const re = /<bu-ext2d:BuildingPart gml:id="([^"]+)">([\s\S]*?)<\/bu-ext2d:BuildingPart>/g;
  for (const m of gml.matchAll(re)) {
    const body = m[2];
    const id = m[1].replace(/^ES\.SDGC\.BU\./, "");
    const exterior = /<gml:exterior>[\s\S]*?<gml:posList[^>]*>([^<]+)<\/gml:posList>/.exec(body);
    if (!exterior) continue;
    const outer = cleanRing(parsePosList(exterior[1], toLocal));
    if (outer.length < 3) continue;
    const holes = [...body.matchAll(/<gml:interior>[\s\S]*?<gml:posList[^>]*>([^<]+)<\/gml:posList>/g)]
      .map((h) => cleanRing(parsePosList(h[1], toLocal)))
      .filter((h) => h.length >= 3)
      .map((h) => withOrientation(h, false));
    const above = /numberOfFloorsAboveGround>(\d+)</.exec(body);
    const below = /numberOfFloorsBelowGround>(\d+)</.exec(body);
    parts.push({
      id,
      ref: id.split("_")[0],
      outer: withOrientation(outer, true),
      holes,
      floorsAbove: above ? Number(above[1]) : 0,
      floorsBelow: below ? Number(below[1]) : 0,
    });
  }
  return parts;
}
