/**
 * Geometria del mapa com a arrays de vèrtexs i índexs, sense dependre de Three.js.
 * El client la converteix en malles i el servidor en col·lisions: tots dos fan servir els mateixos triangles.
 */
import earcut from "earcut";
import type { TerrainField } from "./terrain.ts";
import { type BuildingData, type WallData, type WallKind, type Vec2, FACADE_STYLES } from "./types.ts";

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** Atributs addicionals per vèrtex (nom → valors i mida del component). */
  attributes: Record<string, { itemSize: number; array: Float32Array }>;
}

export class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly indices: number[] = [];
  private readonly extra = new Map<string, { itemSize: number; values: number[] }>();

  constructor(extraAttributes: Record<string, number> = {}) {
    for (const [name, itemSize] of Object.entries(extraAttributes)) this.extra.set(name, { itemSize, values: [] });
  }

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u = 0, v = 0, extra: Record<string, number[]> = {}): number {
    this.positions.push(x, y, z);
    this.normals.push(nx, ny, nz);
    this.uvs.push(u, v);
    for (const [name, attr] of this.extra) {
      const values = extra[name];
      for (let i = 0; i < attr.itemSize; i++) attr.values.push(values?.[i] ?? 0);
    }
    return this.positions.length / 3 - 1;
  }

  triangle(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }

  build(): MeshData {
    const attributes: MeshData["attributes"] = {};
    for (const [name, attr] of this.extra) attributes[name] = { itemSize: attr.itemSize, array: new Float32Array(attr.values) };
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      uvs: new Float32Array(this.uvs),
      indices: new Uint32Array(this.indices),
      attributes,
    };
  }
}

/** Concatena malles (només posicions i índexs): per a col·lisions. */
export function mergeForCollision(meshes: readonly MeshData[]): { positions: Float32Array; indices: Uint32Array } {
  const vCount = meshes.reduce((s, m) => s + m.positions.length, 0);
  const iCount = meshes.reduce((s, m) => s + m.indices.length, 0);
  const positions = new Float32Array(vCount);
  const indices = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const m of meshes) {
    positions.set(m.positions, vo);
    const base = vo / 3;
    for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i] + base;
    vo += m.positions.length;
    io += m.indices.length;
  }
  return { positions, indices };
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// ---------------------------------------------------------------------------------------------
// Terreny

/** Malla del terreny: una mostra per vèrtex i dos triangles per cel·la (diagonal (c, r) → (c+1, r+1)). */
export function buildTerrainMesh(t: TerrainField): MeshData {
  const { cols, rows, cellSize, originX, originZ, heights } = t;
  const positions = new Float32Array(cols * rows * 3);
  const normals = new Float32Array(cols * rows * 3);
  const uvs = new Float32Array(cols * rows * 2);
  const width = (cols - 1) * cellSize;
  const depth = (rows - 1) * cellSize;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = originX + c * cellSize;
      const z = originZ + r * cellSize;
      positions[i * 3] = x;
      positions[i * 3 + 1] = heights[i];
      positions[i * 3 + 2] = z;
      // Normal per diferències centrals.
      const hl = t.sample(c - 1, r);
      const hr = t.sample(c + 1, r);
      const hu = t.sample(c, r - 1);
      const hd = t.sample(c, r + 1);
      const nx = hl - hr;
      const nz = hu - hd;
      const ny = 2 * cellSize;
      const len = Math.hypot(nx, ny, nz);
      normals[i * 3] = nx / len;
      normals[i * 3 + 1] = ny / len;
      normals[i * 3 + 2] = nz / len;
      uvs[i * 2] = (x - originX) / width;
      uvs[i * 2 + 1] = (z - originZ) / depth;
    }
  }
  const indices = new Uint32Array((cols - 1) * (rows - 1) * 6);
  let k = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const p00 = r * cols + c;
      const p10 = p00 + 1;
      const p01 = p00 + cols;
      const p11 = p01 + 1;
      indices[k++] = p00;
      indices[k++] = p01;
      indices[k++] = p11;
      indices[k++] = p00;
      indices[k++] = p11;
      indices[k++] = p10;
    }
  }
  return { positions, normals, uvs, indices, attributes: {} };
}

// ---------------------------------------------------------------------------------------------
// Edificis

export const FACADE_ATTR = "facade";
export const COLOR_ATTR = "color";

export interface BuildingsMesh {
  /** Parets: uv = (metres al llarg del perímetre, metres sobre la planta baixa); facade = (alçada de planta, alçada total, llavor, estil). */
  walls: MeshData;
  /** Terrats i sotabancs (cares horitzontals). */
  roofs: MeshData;
}

/** Alçada de planta visual (m) a partir de l'alçada total i el nombre de plantes. */
function floorHeightOf(b: BuildingData): number {
  return b.levels > 0 ? b.height / b.levels : 3.5;
}

function addWallRing(mb: MeshBuilder, ring: Vec2[], b: BuildingData, yBottom: number, yTop: number, seed: number): void {
  const rgb = hexToRgb(b.color);
  const facade = [floorHeightOf(b), b.height, seed, FACADE_STYLES.indexOf(b.facade)];
  const vBottom = yBottom - b.baseY;
  const vTop = yTop - b.baseY;
  let u = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const c = ring[(i + 1) % ring.length];
    const dx = c[0] - a[0];
    const dz = c[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) continue;
    // Normal exterior: anell exterior amb àrea positiva (i forats amb negativa) → (dz, -dx).
    const nx = dz / len;
    const nz = -dx / len;
    const extra = { [COLOR_ATTR]: rgb, [FACADE_ATTR]: facade };
    const v0 = mb.vertex(a[0], yBottom, a[1], nx, 0, nz, u, vBottom, extra);
    const v1 = mb.vertex(c[0], yBottom, c[1], nx, 0, nz, u + len, vBottom, extra);
    const v2 = mb.vertex(c[0], yTop, c[1], nx, 0, nz, u + len, vTop, extra);
    const v3 = mb.vertex(a[0], yTop, a[1], nx, 0, nz, u, vTop, extra);
    mb.triangle(v0, v2, v1);
    mb.triangle(v0, v3, v2);
    u += len;
  }
}

/** Cara horitzontal (terrat o sotabanc) triangulada amb earcut. */
function addCap(mb: MeshBuilder, outer: Vec2[], holes: Vec2[][], y: number, up: boolean, rgb: number[]): void {
  const flat: number[] = [];
  const holeIndices: number[] = [];
  for (const p of outer) flat.push(p[0], p[1]);
  for (const h of holes) {
    holeIndices.push(flat.length / 2);
    for (const p of h) flat.push(p[0], p[1]);
  }
  const tris = earcut(flat, holeIndices.length ? holeIndices : undefined, 2);
  const ny = up ? 1 : -1;
  const base = mb.vertexCount;
  for (let i = 0; i < flat.length; i += 2) {
    mb.vertex(flat[i], y, flat[i + 1], 0, ny, 0, flat[i], flat[i + 1], { [COLOR_ATTR]: rgb });
  }
  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i];
    const b = tris[i + 1];
    const c = tris[i + 2];
    // Normal = (B−A)×(C−A); la component y val (bz−az)(cx−ax) − (bx−ax)(cz−az).
    const cross = (flat[b * 2 + 1] - flat[a * 2 + 1]) * (flat[c * 2] - flat[a * 2]) - (flat[b * 2] - flat[a * 2]) * (flat[c * 2 + 1] - flat[a * 2 + 1]);
    if (cross > 0 === up) mb.triangle(base + a, base + b, base + c);
    else mb.triangle(base + a, base + c, base + b);
  }
}

export function buildBuildingsMesh(buildings: readonly BuildingData[]): BuildingsMesh {
  const walls = new MeshBuilder({ [COLOR_ATTR]: 3, [FACADE_ATTR]: 4 });
  const roofs = new MeshBuilder({ [COLOR_ATTR]: 3 });
  buildings.forEach((b, i) => {
    const yTop = b.baseY + b.height;
    const yBottom = b.minHeight > 0 ? b.baseY + b.minHeight : b.footY;
    const seed = (i * 0.6180339) % 1;
    addWallRing(walls, b.footprint, b, yBottom, yTop, seed);
    for (const h of b.holes) addWallRing(walls, h, b, yBottom, yTop, seed);
    const roofRgb = hexToRgb(b.roofColor);
    addCap(roofs, b.footprint, b.holes, yTop, true, roofRgb);
    if (b.minHeight > 0) addCap(roofs, b.footprint, b.holes, yBottom, false, roofRgb);
  });
  return { walls: walls.build(), roofs: roofs.build() };
}

// ---------------------------------------------------------------------------------------------
// Murs, tanques i bardisses

export const WALL_COLORS: Record<WallKind, string> = {
  wall: "#bab2a3",
  retaining: "#a8a196",
  fence: "#3f454b",
  hedge: "#44703a",
  planter: "#948a7c",
};

/** Caixa inclinada per cada tram: la base segueix el terreny (enterrada) i el cim queda `height` per sobre. */
export function buildWallsMesh(walls: readonly WallData[], terrain: TerrainField): MeshData {
  const mb = new MeshBuilder({ [COLOR_ATTR]: 3 });
  for (const w of walls) {
    const rgb = hexToRgb(WALL_COLORS[w.kind]);
    const pts = w.closed ? [...w.points, w.points[0]] : w.points;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.05) continue;
      // Perpendicular (costat esquerre/dret) per al gruix.
      const px = (-dz / len) * (w.thickness / 2);
      const pz = (dx / len) * (w.thickness / 2);
      let topA: number;
      let topB: number;
      let bottom: number;
      if (w.kind === "retaining") {
        // Mur de contenció: cobreix el desnivell entre els dos costats i fa de barana pel costat alt.
        const side = (p: Vec2, s: number): number => terrain.heightAt(p[0] + (px / (w.thickness / 2)) * 2.5 * s, p[1] + (pz / (w.thickness / 2)) * 2.5 * s);
        const highA = Math.max(side(a, 1), side(a, -1), terrain.heightAt(a[0], a[1]));
        const highB = Math.max(side(b, 1), side(b, -1), terrain.heightAt(b[0], b[1]));
        const lowAll = Math.min(side(a, 1), side(a, -1), side(b, 1), side(b, -1));
        topA = highA + w.height;
        topB = highB + w.height;
        bottom = lowAll - 0.3;
      } else {
        const ha = terrain.heightAt(a[0], a[1]);
        const hb = terrain.heightAt(b[0], b[1]);
        topA = ha + w.height;
        topB = hb + w.height;
        bottom = Math.min(ha, hb) - 0.3;
      }
      addBox(mb, a, b, px, pz, bottom, topA, topB, rgb);
    }
  }
  return mb.build();
}

/** Caixa entre a i b amb gruix (px, pz) a cada costat, base plana i cim inclinat. */
function addBox(mb: MeshBuilder, a: Vec2, b: Vec2, px: number, pz: number, bottom: number, topA: number, topB: number, rgb: number[]): void {
  const extra = { [COLOR_ATTR]: rgb };
  // Cantonades en planta: L = costat +p, R = costat −p.
  const aL: Vec2 = [a[0] + px, a[1] + pz];
  const aR: Vec2 = [a[0] - px, a[1] - pz];
  const bL: Vec2 = [b[0] + px, b[1] + pz];
  const bR: Vec2 = [b[0] - px, b[1] - pz];
  const quad = (p0: [number, number, number], p1: [number, number, number], p2: [number, number, number], p3: [number, number, number]): void => {
    // Els quatre punts van en sentit horari vistos des de fora: la normal exterior és −(p1−p0)×(p2−p0).
    const ux = p1[0] - p0[0];
    const uy = p1[1] - p0[1];
    const uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0];
    const vy = p2[1] - p0[1];
    const vz = p2[2] - p0[2];
    let nx = -(uy * vz - uz * vy);
    let ny = -(uz * vx - ux * vz);
    let nz = -(ux * vy - uy * vx);
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const i0 = mb.vertex(...p0, nx, ny, nz, 0, 0, extra);
    const i1 = mb.vertex(...p1, nx, ny, nz, 1, 0, extra);
    const i2 = mb.vertex(...p2, nx, ny, nz, 1, 1, extra);
    const i3 = mb.vertex(...p3, nx, ny, nz, 0, 1, extra);
    mb.triangle(i0, i2, i1);
    mb.triangle(i0, i3, i2);
  };
  // Costat R (−p) mirant cap a −p: a→b vist des de fora.
  quad([aR[0], bottom, aR[1]], [bR[0], bottom, bR[1]], [bR[0], topB, bR[1]], [aR[0], topA, aR[1]]);
  // Costat L (+p).
  quad([bL[0], bottom, bL[1]], [aL[0], bottom, aL[1]], [aL[0], topA, aL[1]], [bL[0], topB, bL[1]]);
  // Cim.
  quad([aR[0], topA, aR[1]], [bR[0], topB, bR[1]], [bL[0], topB, bL[1]], [aL[0], topA, aL[1]]);
  // Extrems.
  quad([aL[0], bottom, aL[1]], [aR[0], bottom, aR[1]], [aR[0], topA, aR[1]], [aL[0], topA, aL[1]]);
  quad([bR[0], bottom, bR[1]], [bL[0], bottom, bL[1]], [bL[0], topB, bL[1]], [bR[0], topB, bR[1]]);
}
