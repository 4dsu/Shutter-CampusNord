/**
 * Format del mapa generat per tools/map-import i consumit pel client i pel servidor.
 *
 * Sistema de coordenades (metres):
 *   x = est, y = amunt, z = sud  (el nord és -z)
 * L'origen és el centre del Campus Nord; les alçades són relatives a `datum` (m sobre el nivell del mar).
 */

/** Punt en planta: [x, z]. */
export type Vec2 = [number, number];

export const MAP_FORMAT_VERSION = 1;

export interface MapData {
  format: typeof MAP_FORMAT_VERSION;
  name: string;
  /** Georeferència de l'origen: x = easting − origin.easting, z = origin.northing − northing (UTM 31N, ETRS89). */
  origin: { lat: number; lon: number; utmZone: number; easting: number; northing: number };
  /** Alçada sobre el nivell del mar que correspon a y = 0. */
  datum: number;
  attribution: string[];
  /** Polígon on es pot jugar (límit del campus). */
  playArea: Vec2[];
  terrain: TerrainData;
  /** Ortofoto que cobreix exactament l'extensió del terreny (fila 0 = nord). */
  orthophoto?: { file: string; width: number; height: number };
  buildings: BuildingData[];
  areas: AreaData[];
  paths: PathData[];
  walls: WallData[];
  props: PropData[];
}

export interface TerrainData {
  /** Coordenades de la mostra (col 0, fila 0), que és la cantonada nord-oest (x mínima, z mínima). */
  originX: number;
  originZ: number;
  cellSize: number;
  /** Nombre de mostres en x (cols) i en z (rows). */
  cols: number;
  rows: number;
  /** Alçades sobre el datum en centímetres (Uint16 little-endian) codificades en base64; índex = row * cols + col. */
  heightsCm: string;
}

export type BuildingKind = "university" | "office" | "dormitory" | "sports" | "public" | "residential" | "other";

/**
 * Estil de façana (el dibuixa el shader del client):
 *  - campus: maó vermell amb graella de formigó i finestres verticals (edificis A–D)
 *  - glass: franges de vidre (Omega, BSC, Biblioteca…)
 *  - punched: finestres retallades en paret massissa (habitatges, Nexus II…)
 *  - strips: finestres en franja (per defecte)
 *  - arcade: fila A: porxo de pilars de formigó a la planta baixa, maó amb finestres retallades a sobre i cornisa
 */
export type FacadeStyle = "strips" | "campus" | "glass" | "punched" | "arcade";

// L'ordre és l'índex que rep el shader (atribut facade.w): afegiu estils nous al final.
export const FACADE_STYLES: readonly FacadeStyle[] = ["strips", "campus", "glass", "punched", "arcade"];

export type EntranceKind = "main" | "secondary" | "service" | "other";

export interface Entrance {
  pos: Vec2;
  kind: EntranceKind;
}

export interface BuildingData {
  /** Identificador estable: codi del campus ("A5", "omega") o "osm-<id>". */
  id: string;
  osmId: number;
  name: string;
  /** Rètol gran pintat a la façana ("A5", "B6", "Ω"). */
  label?: string;
  kind: BuildingKind;
  /** Anell exterior en sentit antihorari en el pla x-z (àrea amb signe positiva, vegeu geo.signedArea). */
  footprint: Vec2[];
  holes: Vec2[][];
  /** Cota del terra de la planta baixa (relativa al datum). */
  baseY: number;
  /** Cota on comencen les parets (per sota del punt més baix del terreny al perímetre, perquè no quedin forats). */
  footY: number;
  /** Alçada des de baseY fins al terrat. */
  height: number;
  /** Alçada des de baseY on comencen les parets (voladissos, passarel·les); normalment 0. */
  minHeight: number;
  levels: number;
  color: string;
  facade: FacadeStyle;
  roofColor: string;
  /** Edifici de fora del campus: només decorat. */
  background: boolean;
  /** Identificador de l'interior jugable, si en té. */
  interior?: string;
  entrances: Entrance[];
}

export type AreaKind =
  | "grass"
  | "flowerbed"
  | "paving"
  | "asphalt"
  | "dirt"
  | "water"
  | "pitch"
  | "parking"
  | "wood";

export interface AreaData {
  kind: AreaKind;
  ring: Vec2[];
  holes: Vec2[][];
}

export type PathKind = "footway" | "steps" | "pedestrian" | "service" | "street" | "cycleway" | "path";

export interface PathData {
  kind: PathKind;
  points: Vec2[];
  width: number;
}

export type WallKind = "wall" | "retaining" | "fence" | "hedge" | "planter";

export interface WallData {
  kind: WallKind;
  points: Vec2[];
  /** Alçada per sobre del terreny (per als murs de contenció: barana per sobre del costat alt). */
  height: number;
  thickness: number;
  closed: boolean;
}

export type PropKind =
  | "tree"
  | "palm"
  | "conifer"
  | "shrub"
  | "lamp"
  | "bench"
  | "picnic_table"
  | "waste_basket"
  | "bicycle_parking"
  | "planter"
  | "drinking_water"
  | "vending_machine";

export interface PropData {
  kind: PropKind;
  pos: Vec2;
  /** Rotació al voltant de y (radians). */
  rot: number;
  /** Escala relativa (arbres: alçada aproximada en metres / 10). */
  scale: number;
}
