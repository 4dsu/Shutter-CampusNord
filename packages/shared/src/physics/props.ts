import type { PropKind } from "../map/types.ts";

/** Forma de col·lisió d'un objecte, en coordenades locals (origen a terra, objecte mirant cap a +z). */
export type PropShape =
  | { type: "cylinder"; radius: number; halfHeight: number; y: number }
  | { type: "cuboid"; hx: number; hy: number; hz: number; y: number; z: number };

/**
 * Col·lisions simplificades dels objectes. Les copes dels arbres i els arbustos no en tenen:
 * es pot disparar i passar a través del fullatge.
 */
export function propShapes(kind: PropKind, scale: number): PropShape[] {
  switch (kind) {
    case "tree":
      return [{ type: "cylinder", radius: Math.max(0.14, 0.24 * scale), halfHeight: 2.1 * scale, y: 2.1 * scale }];
    case "palm":
      return [{ type: "cylinder", radius: Math.max(0.16, 0.26 * scale), halfHeight: 4.1 * scale, y: 4.1 * scale }];
    case "conifer":
      return [{ type: "cylinder", radius: Math.max(0.14, 0.2 * scale), halfHeight: 1.2 * scale, y: 1.2 * scale }];
    case "lamp":
      return [{ type: "cylinder", radius: 0.1, halfHeight: 2.3, y: 2.3 }];
    case "bench":
      return [{ type: "cuboid", hx: 0.9, hy: 0.48, hz: 0.25, y: 0.48, z: -0.02 }];
    case "picnic_table":
      return [{ type: "cuboid", hx: 0.95, hy: 0.4, hz: 0.8, y: 0.4, z: 0 }];
    case "waste_basket":
      return [{ type: "cylinder", radius: 0.22, halfHeight: 0.4, y: 0.4 }];
    case "bicycle_parking":
      return [{ type: "cuboid", hx: 1.3, hy: 0.42, hz: 0.4, y: 0.42, z: 0 }];
    case "planter":
      return [{ type: "cuboid", hx: 0.6, hy: 0.35, hz: 0.6, y: 0.35, z: 0 }];
    case "drinking_water":
      return [{ type: "cylinder", radius: 0.16, halfHeight: 0.5, y: 0.5 }];
    case "vending_machine":
      return [{ type: "cuboid", hx: 0.48, hy: 0.93, hz: 0.4, y: 0.93, z: 0 }];
    case "shrub":
      return [];
  }
}
