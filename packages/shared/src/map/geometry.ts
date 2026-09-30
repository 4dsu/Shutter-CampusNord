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

// ---------------------------------------------------------------------------------------------
// Kits de façana amb relleu (només render: la col·lisió és la closca de buildBuildingsMesh).
// Tot el relleu va cap endins del pla del contorn, de manera que res no sobresurt de la col·lisió.

type P3 = [number, number, number];

/** Quadrilàter amb la normal indicada: l'ordre dels triangles s'ajusta sol perquè la cara miri cap a `n`. */
function quad(mb: MeshBuilder, p: [P3, P3, P3, P3], n: P3, uv: [number, number][], extra: Record<string, number[]> = {}): void {
  const [p0, p1, p2] = p;
  const ux = p1[0] - p0[0];
  const uy = p1[1] - p0[1];
  const uz = p1[2] - p0[2];
  const vx = p2[0] - p0[0];
  const vy = p2[1] - p0[1];
  const vz = p2[2] - p0[2];
  const gx = uy * vz - uz * vy;
  const gy = uz * vx - ux * vz;
  const gz = ux * vy - uy * vx;
  const i = p.map((q, k) => mb.vertex(q[0], q[1], q[2], n[0], n[1], n[2], uv[k][0], uv[k][1], extra));
  if (gx * n[0] + gy * n[1] + gz * n[2] >= 0) {
    mb.triangle(i[0], i[1], i[2]);
    mb.triangle(i[0], i[2], i[3]);
  } else {
    mb.triangle(i[0], i[2], i[1]);
    mb.triangle(i[0], i[3], i[2]);
  }
}

/**
 * Sistema local d'un tram de façana: t al llarg del tram (0..L), y amunt (absoluta), d cap enfora (normal exterior).
 * UV en metres: u = t, v = alçada sobre la planta baixa.
 */
class EdgeFrame {
  readonly L: number;
  readonly N: P3;
  readonly U: P3;
  readonly Um: P3;
  readonly Nm: P3;
  private readonly a: Vec2;
  private readonly ux: number;
  private readonly uz: number;
  private readonly base: number;

  constructor(a: Vec2, c: Vec2, baseY: number) {
    this.a = a;
    const dx = c[0] - a[0];
    const dz = c[1] - a[1];
    this.L = Math.hypot(dx, dz);
    this.ux = dx / this.L;
    this.uz = dz / this.L;
    // Normal exterior (vegeu addWallRing): anell exterior amb àrea positiva.
    this.N = [this.uz, 0, -this.ux];
    this.Nm = [-this.uz, 0, this.ux];
    this.U = [this.ux, 0, this.uz];
    this.Um = [-this.ux, 0, -this.uz];
    this.base = baseY;
  }

  P(t: number, y: number, d: number): P3 {
    return [this.a[0] + this.ux * t + this.N[0] * d, y, this.a[1] + this.uz * t + this.N[2] * d];
  }

  /** Cara que mira enfora (o endins amb `inward`), en el pla de profunditat d. */
  front(mb: MeshBuilder, t0: number, t1: number, y0: number, y1: number, d: number, extra: Record<string, number[]> = {}, inward = false): void {
    const b = this.base;
    quad(mb, [this.P(t0, y0, d), this.P(t1, y0, d), this.P(t1, y1, d), this.P(t0, y1, d)], inward ? this.Nm : this.N, [
      [t0, y0 - b],
      [t1, y0 - b],
      [t1, y1 - b],
      [t0, y1 - b],
    ], extra);
  }

  /** Cara perpendicular a la façana a la posició t, entre les profunditats d0 i d1. */
  side(mb: MeshBuilder, t: number, y0: number, y1: number, d0: number, d1: number, n: P3, extra: Record<string, number[]> = {}): void {
    quad(mb, [this.P(t, y0, d0), this.P(t, y0, d1), this.P(t, y1, d1), this.P(t, y1, d0)], n, [
      [d0, y0],
      [d1, y0],
      [d1, y1],
      [d0, y1],
    ], extra);
  }

  /** Cara horitzontal a l'alçada y entre les profunditats d0 i d1. */
  flat(mb: MeshBuilder, t0: number, t1: number, y: number, d0: number, d1: number, up: boolean, extra: Record<string, number[]> = {}): void {
    quad(mb, [this.P(t0, y, d0), this.P(t1, y, d0), this.P(t1, y, d1), this.P(t0, y, d1)], up ? [0, 1, 0] : [0, -1, 0], [
      [t0, d0],
      [t1, d0],
      [t1, d1],
      [t0, d1],
    ], extra);
  }

  /** Ampit del terrat: cara exterior, capçal i cara interior. */
  parapet(mb: MeshBuilder, yTop: number, h: number, depth: number, extra: Record<string, number[]> = {}): void {
    this.front(mb, 0, this.L, yTop, yTop + h, 0, extra);
    this.flat(mb, 0, this.L, yTop + h, 0, -depth, true, extra);
    this.front(mb, 0, this.L, yTop, yTop + h, -depth, extra, true);
  }
}

export interface FacadeKitMeshes {
  brick: MeshData;
  concrete: MeshData;
  glass: MeshData;
  /** Alumini: lamel·les, muntants i fusteria. */
  metal: MeshData;
  /** Arrebossat amb el color de cada edifici (atribut `color`, sRGB). */
  plaster: MeshData;
}

/** Mides del kit A–D (m). La graella de formigó queda a ras del contorn; el maó i les finestres, enfonsats. */
export const CAMPUS_KIT = {
  bay: 3.6,
  pillar: 0.36,
  slab: 0.32,
  panelDepth: 0.22,
  windowDepth: 0.16,
  parapet: 0.9,
  louvers: 7,
} as const;

/** Quins edificis tenen façana amb relleu (la resta es dibuixen amb la closca i el patró del shader). */
export function hasFacadeKit(b: BuildingData): boolean {
  return !b.background && (b.facade === "campus" || b.facade === "glass" || b.facade === "punched");
}

interface KitBuilders {
  brick: MeshBuilder;
  concrete: MeshBuilder;
  glass: MeshBuilder;
  metal: MeshBuilder;
  plaster: MeshBuilder;
}

/** Edificis A–D: pilars i forjats de formigó, plafons de maó i una finestra vertical amb lamel·les per crugia. */
function campusEdge(f: EdgeFrame, b: BuildingData, k: KitBuilders): void {
  const K = CAMPUS_KIT;
  const L = f.L;
  const floors = Math.max(1, b.levels);
  const floorH = b.height / floors;
  const yb = b.baseY + (b.minHeight > 0 ? b.minHeight : 0);
  const yTop = b.baseY + b.height;
  if (b.minHeight <= 0 && b.footY < yb) f.front(k.concrete, 0, L, b.footY, yb, 0);
  f.parapet(k.concrete, yTop, K.parapet, 0.3);
  if (L < K.bay * 0.5) {
    f.front(k.concrete, 0, L, yb, yTop, 0);
    return;
  }
  const bays = Math.max(1, Math.round(L / K.bay));
  const w = L / bays;
  const hp = K.pillar / 2;
  const D1 = -K.panelDepth;
  const D2 = -(K.panelDepth + K.windowDepth);
  for (let i = 0; i <= bays; i++) {
    const t0 = Math.max(0, i * w - hp);
    const t1 = Math.min(L, i * w + hp);
    f.front(k.concrete, t0, t1, yb, yTop, 0);
    if (i > 0) f.side(k.concrete, t0, yb, yTop, 0, D1, f.Um);
    if (i < bays) f.side(k.concrete, t1, yb, yTop, 0, D1, f.U);
  }
  for (let fl = 0; fl <= floors; fl++) {
    const yf = yb + fl * floorH;
    const y0 = fl === 0 ? yb : yf - K.slab / 2;
    const y1 = fl === floors ? yTop : fl === 0 ? yb + K.slab : yf + K.slab / 2;
    f.front(k.concrete, 0, L, y0, y1, 0);
    if (fl > 0) f.flat(k.concrete, 0, L, y0, 0, D1, false);
    if (fl < floors) f.flat(k.concrete, 0, L, y1, 0, D1, true);
  }
  for (let fl = 0; fl < floors; fl++) {
    const y0 = fl === 0 ? yb + K.slab : yb + fl * floorH + K.slab / 2;
    const y1 = fl === floors - 1 ? yTop - K.slab / 2 : yb + (fl + 1) * floorH - K.slab / 2;
    for (let i = 0; i < bays; i++) {
      const t0 = i * w + hp;
      const t1 = (i + 1) * w - hp;
      const ww = Math.min(1.0, (t1 - t0) * 0.32);
      const wx1 = t1 - 0.3;
      const wx0 = wx1 - ww;
      const wy0 = y0 + 0.3;
      const wy1 = y1 - 0.12;
      f.front(k.brick, t0, wx0, y0, y1, D1);
      f.front(k.brick, wx1, t1, y0, y1, D1);
      f.front(k.brick, wx0, wx1, y0, wy0, D1);
      f.front(k.brick, wx0, wx1, wy1, y1, D1);
      f.side(k.concrete, wx0, wy0, wy1, D1, D2, f.U);
      f.side(k.concrete, wx1, wy0, wy1, D1, D2, f.Um);
      f.flat(k.concrete, wx0, wx1, wy0, D1, D2, true);
      f.flat(k.concrete, wx0, wx1, wy1, D1, D2, false);
      f.front(k.glass, wx0, wx1, wy0, wy1, D2);
      const slat = (wy1 - wy0) / K.louvers;
      for (let s = 0; s < K.louvers; s++) {
        const ly = wy0 + s * slat + slat * 0.25;
        f.front(k.metal, wx0 + 0.02, wx1 - 0.02, ly, ly + slat * 0.45, D1 - 0.04);
      }
    }
  }
}

/** Mur cortina: a cada planta una franja opaca i una franja de vidre enfonsada, amb muntants d'alumini cada 1,5 m. */
function glassEdge(f: EdgeFrame, b: BuildingData, k: KitBuilders, rgb: number[]): void {
  const L = f.L;
  const floors = Math.max(1, b.levels);
  const floorH = b.height / floors;
  const yb = b.baseY + (b.minHeight > 0 ? b.minHeight : 0);
  const yTop = b.baseY + b.height;
  const color = { [COLOR_ATTR]: rgb };
  const DS = -0.06; // franja opaca
  const DG = -0.2; // vidre
  const spandrel = Math.min(1.0, floorH * 0.3);
  if (b.minHeight <= 0 && b.footY < yb) f.front(k.concrete, 0, L, b.footY, yb, 0);
  f.parapet(k.plaster, yTop, 0.7, 0.25, color);
  for (let fl = 0; fl < floors; fl++) {
    const y0 = yb + fl * floorH;
    const y1 = y0 + floorH;
    // La planta baixa és més vidrada.
    const ys = fl === 0 ? y0 + 0.15 : y0 + spandrel;
    f.front(k.plaster, 0, L, y0, ys, DS, color);
    f.flat(k.metal, 0, L, ys, DS, DG, true);
    f.front(k.glass, 0, L, ys, y1, DG);
    f.flat(k.metal, 0, L, y1, DS, DG, false);
  }
  const mullions = Math.max(1, Math.round(L / 1.5));
  for (let i = 0; i <= mullions; i++) {
    const t = (i * L) / mullions;
    const t0 = Math.max(0, t - 0.05);
    const t1 = Math.min(L, t + 0.05);
    f.front(k.metal, t0, t1, yb, yTop, 0);
    if (i > 0) f.side(k.metal, t0, yb, yTop, 0, DG, f.Um);
    if (i < mullions) f.side(k.metal, t1, yb, yTop, 0, DG, f.U);
  }
}

/** Paret d'arrebossat amb finestres retallades: brancals enfonsats i vidre al fons. */
function punchedEdge(f: EdgeFrame, b: BuildingData, k: KitBuilders, rgb: number[]): void {
  const L = f.L;
  const floors = Math.max(1, b.levels);
  const floorH = b.height / floors;
  const yb = b.baseY + (b.minHeight > 0 ? b.minHeight : 0);
  const yTop = b.baseY + b.height;
  const color = { [COLOR_ATTR]: rgb };
  const reveal = { [COLOR_ATTR]: rgb.map((c) => c * 0.8) };
  const DW = -0.25;
  if (b.minHeight <= 0 && b.footY < yb) f.front(k.concrete, 0, L, b.footY, yb, 0);
  f.parapet(k.plaster, yTop, 0.8, 0.3, color);
  const bays = Math.max(1, Math.round(L / 3.0));
  const w = L / bays;
  if (w < 1.2) {
    f.front(k.plaster, 0, L, yb, yTop, 0, color);
    return;
  }
  for (let fl = 0; fl < floors; fl++) {
    const y0 = yb + fl * floorH;
    const y1 = y0 + floorH;
    const wy0 = y0 + Math.min(0.9, floorH * 0.28);
    const wy1 = y1 - Math.min(0.5, floorH * 0.15);
    for (let i = 0; i < bays; i++) {
      const t0 = i * w;
      const t1 = t0 + w;
      const ww = Math.min(1.4, w * 0.5);
      const wx0 = t0 + (w - ww) / 2;
      const wx1 = wx0 + ww;
      f.front(k.plaster, t0, wx0, y0, y1, 0, color);
      f.front(k.plaster, wx1, t1, y0, y1, 0, color);
      f.front(k.plaster, wx0, wx1, y0, wy0, 0, color);
      f.front(k.plaster, wx0, wx1, wy1, y1, 0, color);
      f.side(k.plaster, wx0, wy0, wy1, 0, DW, f.U, reveal);
      f.side(k.plaster, wx1, wy0, wy1, 0, DW, f.Um, reveal);
      f.flat(k.concrete, wx0, wx1, wy0, 0, DW, true);
      f.flat(k.plaster, wx0, wx1, wy1, 0, DW, false, reveal);
      f.front(k.glass, wx0, wx1, wy0, wy1, DW);
      // Travesser de la fusteria.
      const mid = wy0 + (wy1 - wy0) * 0.62;
      f.front(k.metal, wx0, wx1, mid - 0.03, mid + 0.03, DW + 0.03);
    }
  }
}

/**
 * Façanes amb relleu per als edificis del campus que en tenen (vegeu `hasFacadeKit`).
 * UV en metres (u al llarg de la façana, v amunt) per a textures en mosaic.
 */
export function buildFacadeKits(buildings: readonly BuildingData[]): FacadeKitMeshes {
  const k: KitBuilders = {
    brick: new MeshBuilder(),
    concrete: new MeshBuilder(),
    glass: new MeshBuilder(),
    metal: new MeshBuilder(),
    plaster: new MeshBuilder({ [COLOR_ATTR]: 3 }),
  };
  for (const b of buildings) {
    if (!hasFacadeKit(b)) continue;
    const rgb = hexToRgb(b.color);
    for (const ring of [b.footprint, ...b.holes]) {
      for (let e = 0; e < ring.length; e++) {
        const a = ring[e];
        const c = ring[(e + 1) % ring.length];
        if (Math.hypot(c[0] - a[0], c[1] - a[1]) < 0.05) continue;
        const f = new EdgeFrame(a, c, b.baseY);
        if (b.facade === "campus") campusEdge(f, b, k);
        else if (b.facade === "glass") glassEdge(f, b, k, rgb);
        else punchedEdge(f, b, k, rgb);
      }
    }
  }
  return {
    brick: k.brick.build(),
    concrete: k.concrete.build(),
    glass: k.glass.build(),
    metal: k.metal.build(),
    plaster: k.plaster.build(),
  };
}
