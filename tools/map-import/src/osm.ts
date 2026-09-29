import type { Vec2 } from "@shutter/shared/map";

export type Tags = Record<string, string>;

export interface OsmNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: Tags;
}

export interface OsmWay {
  type: "way";
  id: number;
  nodes: number[];
  tags?: Tags;
}

export interface OsmRelation {
  type: "relation";
  id: number;
  members: { type: "node" | "way" | "relation"; ref: number; role: string }[];
  tags?: Tags;
}

export interface OsmJson {
  elements: (OsmNode | OsmWay | OsmRelation)[];
}

export class OsmIndex {
  readonly nodes = new Map<number, OsmNode>();
  readonly ways = new Map<number, OsmWay>();
  readonly relations = new Map<number, OsmRelation>();
  private readonly project: (lat: number, lon: number) => Vec2;

  constructor(json: OsmJson, project: (lat: number, lon: number) => Vec2) {
    this.project = project;
    for (const el of json.elements) {
      if (el.type === "node") this.nodes.set(el.id, el);
      else if (el.type === "way") this.ways.set(el.id, el);
      else this.relations.set(el.id, el);
    }
  }

  nodePos(id: number): Vec2 | undefined {
    const n = this.nodes.get(id);
    return n ? this.project(n.lat, n.lon) : undefined;
  }

  /** Punts d'una llista de nodes; retorna undefined si en falta algun (via retallada pel bbox). */
  points(nodeIds: readonly number[]): Vec2[] | undefined {
    const out: Vec2[] = [];
    for (const id of nodeIds) {
      const p = this.nodePos(id);
      if (!p) return undefined;
      out.push(p);
    }
    return out;
  }

  /**
   * Uneix vies en anells tancats (llistes d'ids de node). Les vies poden anar en qualsevol sentit.
   * Les vies que no tanquen cap anell es descarten.
   */
  assembleRings(wayIds: readonly number[]): number[][] {
    const segments = wayIds
      .map((id) => this.ways.get(id)?.nodes.slice())
      .filter((n): n is number[] => !!n && n.length >= 2);
    const rings: number[][] = [];
    while (segments.length > 0) {
      let ring = segments.shift()!;
      let grew = true;
      while (ring[0] !== ring[ring.length - 1] && grew) {
        grew = false;
        for (let i = 0; i < segments.length; i++) {
          const s = segments[i];
          const end = ring[ring.length - 1];
          if (s[0] === end) ring = ring.concat(s.slice(1));
          else if (s[s.length - 1] === end) ring = ring.concat(s.slice(0, -1).reverse());
          else if (s[s.length - 1] === ring[0]) ring = s.concat(ring.slice(1));
          else if (s[0] === ring[0]) ring = s.slice(1).reverse().concat(ring);
          else continue;
          segments.splice(i, 1);
          grew = true;
          break;
        }
      }
      if (ring.length >= 4 && ring[0] === ring[ring.length - 1]) rings.push(ring);
    }
    return rings;
  }

  /** Anells exteriors i interiors (ids de node) d'una relació multipolígon. */
  multipolygon(rel: OsmRelation): { outers: number[][]; inners: number[][] } {
    const wayMembers = rel.members.filter((m) => m.type === "way");
    return {
      outers: this.assembleRings(wayMembers.filter((m) => m.role !== "inner").map((m) => m.ref)),
      inners: this.assembleRings(wayMembers.filter((m) => m.role === "inner").map((m) => m.ref)),
    };
  }
}

export function isClosedWay(way: OsmWay): boolean {
  return way.nodes.length >= 4 && way.nodes[0] === way.nodes[way.nodes.length - 1];
}

/** Llegeix un número d'un tag OSM ("12", "12.5 m", "3;4" → 12, 12.5, 3). */
export function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const m = /-?\d+(?:[.,]\d+)?/.exec(value);
  return m ? Number(m[0].replace(",", ".")) : undefined;
}
