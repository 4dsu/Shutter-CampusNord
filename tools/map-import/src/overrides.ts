import type { BuildingKind, FacadeStyle } from "@shutter/shared/map";

/**
 * Correccions manuals sobre les dades d'OSM, per id de via.
 * OSM no té nom per a alguns edificis de la graella (A4, A5, A6, B3, B6); s'han identificat per posició
 * dins la fila corresponent.
 */
export interface BuildingOverride {
  id?: string;
  name?: string;
  label?: string;
  kind?: BuildingKind;
  levels?: number;
  height?: number;
  color?: string;
  facade?: FacadeStyle;
  roofColor?: string;
  interior?: string;
}

export const BUILDING_OVERRIDES: Record<number, BuildingOverride> = {
  // Fila A (aularis, 5 plantes)
  183542827: { id: "A1" },
  187765241: { id: "A2" },
  187765243: { id: "A3" },
  187765244: { id: "A4", name: "A4" },
  187765249: { id: "A5", name: "A5", interior: "A5" },
  187765253: { id: "A6", name: "A6", interior: "A6" },
  // Fila B
  595330170: { id: "B0" },
  642719986: { id: "B1" },
  642719985: { id: "B2" },
  1124652469: { id: "B3", name: "B3 · ETSETB (Telecos)", label: "B3" },
  642719995: { id: "B4" },
  1124652470: { id: "B5" },
  642719991: { id: "B6", name: "B6 · FIB", label: "B6" },
  // Fila C
  642719987: { id: "C1" },
  642719976: { id: "C2" },
  642719975: { id: "C3" },
  642719982: { id: "C4" },
  642719968: { id: "C5" },
  642719992: { id: "C6" },
  // Fila D
  642719969: { id: "D1" },
  642719938: { id: "D2" },
  642719973: { id: "D3" },
  642719983: { id: "D4" },
  642719974: { id: "D5" },
  642719993: { id: "D6" },
  // Pavellons de vidre entre els edificis de la fila A
  1436110223: { id: "pavello-a5a6", facade: "glass", color: "#dcd9d2" },
  1436110224: { id: "pavello-a4a5", facade: "glass", color: "#dcd9d2" },
  1436110225: { id: "pavello-a2a3", facade: "glass", color: "#dcd9d2" },
  1436110226: { id: "pavello-a1a2", facade: "glass", color: "#dcd9d2" },
  // Altres edificis del campus (colors a partir de fotografies)
  // Omega: formigó blanc amb finestres en franja (no és una façana de vidre).
  642719972: { id: "omega", label: "Ω", facade: "strips", color: "#e6e1d6" },
  642719966: { id: "nexus2", name: "Nexus II", label: "NEXUS II", facade: "punched", color: "#c98b6f" },
  // Nexus I: el cilindre de xapa fosca que es veu des de la plaça.
  18116538: { id: "nexus1", facade: "glass", color: "#5b5d5f", roofColor: "#6f7072" },
  642719980: { id: "biblioteca", label: "BIBLIOTECA", facade: "glass", color: "#d8d2c4", interior: "biblioteca" },
  // Poliesportiu: soterrat sota la Plaça de les Constel·lacions (vegeu PLAZA_DECKS).
  187660313: { id: "poliesportiu", kind: "sports" },
  642719955: { id: "capella", label: "CAPELLA", facade: "punched", color: "#d9bf9f", roofColor: "#a86e52" },
  593611153: { id: "bsc", name: "BSC-Repsol", facade: "glass", color: "#eef0f1" },
  642719945: { id: "tillers", facade: "punched", color: "#cfc6b5" },
  1444137905: { id: "residencia", facade: "punched", color: "#b87a5c" },
};

/** Edificis de la graella A–D: maó vermell amb estructura de formigó. */
export const CAMPUS_GRID_STYLE = {
  facade: "campus" as const,
  colors: ["#b0583b", "#aa5337", "#b65f40"],
  roofColor: "#8e8b85",
};

/**
 * Places que són el terrat d'un edifici semisoterrat (vegeu plaza.ts). L'edifici passa a ocupar tota la zona
 * pavimentada que el conté i el terrat queda a l'altura del costat alt de la plaça.
 */
export interface PlazaDeckSpec {
  /** Id de l'edifici que queda a sota de la plaça. */
  building: string;
  /** Façana del sòcol. */
  color: string;
  /** Paviment de la plaça (el terrat). */
  deckColor: string;
}

export const PLAZA_DECKS: PlazaDeckSpec[] = [
  // Plaça de les Constel·lacions: el poliesportiu és a sota i s'obre amb vidrieres cap a la gespa del sud.
  { building: "poliesportiu", color: "#dcd8cf", deckColor: "#cdc6b7" },
];
