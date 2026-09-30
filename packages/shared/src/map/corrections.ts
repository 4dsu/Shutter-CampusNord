import type { FacadeStyle, Vec2 } from "./types.ts";

/**
 * Correccions manuals del mapa (`tools/map-import/corrections.json`). Les fa l'editor (`?mode=editor`) o es poden
 * escriure a mà; l'importador les aplica per sobre d'OSM i del Cadastre.
 */
export interface MapCorrections {
  version: 1;
  /** Canvis sobre edificis existents, per id (p. ex. "A5", "omega", "B6-p1"). */
  buildings: Record<string, BuildingCorrection>;
  /** Edificis o estructures noves (porxos, pèrgoles…). */
  added: AddedBuilding[];
  /** Places i terrasses: el terreny de dins del polígon queda pla a l'alçada `elevation` (m sobre el mar). */
  platforms: Platform[];
}

export interface BuildingCorrection {
  remove?: boolean;
  footprint?: Vec2[];
  levels?: number;
  /** Alçada total (m); si no hi és, plantes × alçada de planta. */
  height?: number;
  /** Alçada des del terra on comença el volum (porxos, passarel·les). */
  minHeight?: number;
  facade?: FacadeStyle;
  name?: string;
}

export interface AddedBuilding {
  id: string;
  name?: string;
  footprint: Vec2[];
  levels: number;
  height?: number;
  minHeight?: number;
  facade?: FacadeStyle;
}

export interface Platform {
  id: string;
  ring: Vec2[];
  elevation: number;
}

export const emptyCorrections = (): MapCorrections => ({ version: 1, buildings: {}, added: [], platforms: [] });
