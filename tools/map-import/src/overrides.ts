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
  183542827: { id: "A1", facade: "arcade" },
  187765241: { id: "A2", facade: "arcade" },
  187765243: { id: "A3", facade: "arcade" },
  187765244: { id: "A4", name: "A4", facade: "arcade" },
  187765249: { id: "A5", name: "A5", facade: "arcade", interior: "A5" },
  187765253: { id: "A6", name: "A6", facade: "arcade", interior: "A6" },
  // Fila B
  595330170: { id: "B0" },
  642719986: { id: "B1" },
  642719985: { id: "B2" },
  1124652469: { id: "B3", name: "B3 · ETSETB (Telecos)", label: "B3" },
  // B4 està renovat: plafons clars amb finestres verticals (foto de referència).
  642719995: { id: "B4", facade: "punched", color: "#e2ded5" },
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
  642719972: { id: "omega", label: "Ω", facade: "glass", color: "#e4ded2" },
  642719966: { id: "nexus2", name: "Nexus II", label: "NEXUS II", facade: "punched", color: "#c98b6f" },
  18116538: { id: "nexus1", facade: "punched", color: "#d6cbb8" },
  642719980: { id: "biblioteca", label: "BIBLIOTECA", facade: "punched", color: "#d8cfbd", interior: "biblioteca" },
  187660313: { id: "poliesportiu", kind: "sports", levels: 2, height: 9, color: "#c9c3b6" },
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
