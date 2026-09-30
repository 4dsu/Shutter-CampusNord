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
// Kit de façana dels edificis A–D (només render: la col·lisió és la closca de buildBuildingsMesh)

type P3 = [number, number, number];

/** Quadrilàter amb la normal indicada: l'ordre dels triangles s'ajusta sol perquè la cara miri cap a `n`. */
function quad(mb: MeshBuilder, p: [P3, P3, P3, P3], n: P3, uv: [number, number][]): void {
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
  const i = p.map((q, k) => mb.vertex(q[0], q[1], q[2], n[0], n[1], n[2], uv[k][0], uv[k][1]));
  if (gx * n[0] + gy * n[1] + gz * n[2] >= 0) {
    mb.triangle(i[0], i[1], i[2]);
    mb.triangle(i[0], i[2], i[3]);
  } else {
    mb.triangle(i[0], i[2], i[1]);
    mb.triangle(i[0], i[3], i[2]);
  }
}

export interface FacadeKitMeshes {
  brick: MeshData;
  concrete: MeshData;
  glass: MeshData;
  louver: MeshData;
}

/** Mides del kit (m). La graella de formigó queda a ras del contorn; el maó i les finestres, enfonsats. */
export const CAMPUS_KIT = {
  bay: 3.6,
  pillar: 0.36,
  slab: 0.32,
  panelDepth: 0.22,
  windowDepth: 0.16,
  parapet: 0.9,
  louvers: 7,
} as const;

/**
 * Façana detallada dels edificis de la graella A–D: pilars i forjats de formigó, plafons de maó i una finestra
 * vertical amb lamel·les a cada crugia. UV en metres (u al llarg de la façana, v amunt) per a textures en mosaic.
 */
export function buildCampusFacades(buildings: readonly BuildingData[]): FacadeKitMeshes {
  const brick = new MeshBuilder();
  const concrete = new MeshBuilder();
  const glass = new MeshBuilder();
  const louver = new MeshBuilder();
  const K = CAMPUS_KIT;

  for (const b of buildings) {
    if (b.facade !== "campus") continue;
    const floors = Math.max(1, b.levels);
    const floorH = b.height / floors;
    const yb = b.baseY + (b.minHeight > 0 ? b.minHeight : 0);
    const yTop = b.baseY + b.height;
    for (const ring of [b.footprint, ...b.holes]) {
      for (let e = 0; e < ring.length; e++) {
        const a = ring[e];
        const c = ring[(e + 1) % ring.length];
        const dx = c[0] - a[0];
        const dz = c[1] - a[1];
        const L = Math.hypot(dx, dz);
        if (L < 0.05) continue;
        const ux = dx / L;
        const uz = dz / L;
        // Normal exterior (vegeu addWallRing).
        const nx = uz;
        const nz = -ux;
        const P = (t: number, y: number, d: number): P3 => [a[0] + ux * t + nx * d, y, a[1] + uz * t + nz * d];
        const N: P3 = [nx, 0, nz];
        const U: P3 = [ux, 0, uz];
        const Um: P3 = [-ux, 0, -uz];
        const Nm: P3 = [-nx, 0, -nz];
        const UP: P3 = [0, 1, 0];
        const DOWN: P3 = [0, -1, 0];
        /** Cara frontal (mira enfora) en el pla de profunditat d. */
        const front = (mb: MeshBuilder, t0: number, t1: number, y0: number, y1: number, d: number): void =>
          quad(mb, [P(t0, y0, d), P(t1, y0, d), P(t1, y1, d), P(t0, y1, d)], N, [
            [t0, y0 - b.baseY],
            [t1, y0 - b.baseY],
            [t1, y1 - b.baseY],
            [t0, y1 - b.baseY],
          ]);
        /** Cara lateral perpendicular a la façana, a la posició t, entre les profunditats d0 i d1. */
        const side = (mb: MeshBuilder, t: number, y0: number, y1: number, d0: number, d1: number, n: P3): void =>
          quad(mb, [P(t, y0, d0), P(t, y0, d1), P(t, y1, d1), P(t, y1, d0)], n, [
            [d0, y0],
            [d1, y0],
            [d1, y1],
            [d0, y1],
          ]);
        /** Cara horitzontal a l'alçada y (sostre o terra d'un buit). */
        const flat = (mb: MeshBuilder, t0: number, t1: number, y: number, d0: number, d1: number, n: P3): void =>
          quad(mb, [P(t0, y, d0), P(t1, y, d0), P(t1, y, d1), P(t0, y, d1)], n, [
            [t0, d0],
            [t1, d0],
            [t1, d1],
            [t0, d1],
          ]);

        // Sòcol de formigó fins al terreny i ampit del terrat.
        if (b.minHeight <= 0 && b.footY < yb) front(concrete, 0, L, b.footY, yb, 0);
        front(concrete, 0, L, yTop, yTop + K.parapet, 0);
        flat(concrete, 0, L, yTop + K.parapet, 0, -0.3, UP);
        // Cara interior de l'ampit, mirant cap al terrat.
        quad(concrete, [P(0, yTop, -0.3), P(L, yTop, -0.3), P(L, yTop + K.parapet, -0.3), P(0, yTop + K.parapet, -0.3)], Nm, [
          [0, 0],
          [L, 0],
          [L, K.parapet],
          [0, K.parapet],
        ]);

        if (L < K.bay * 0.5) {
          // Tram curt: formigó massís.
          front(concrete, 0, L, yb, yTop, 0);
          continue;
        }
        const bays = Math.max(1, Math.round(L / K.bay));
        const w = L / bays;
        const hp = K.pillar / 2;
        const D1 = -K.panelDepth;
        const D2 = -(K.panelDepth + K.windowDepth);

        // Pilars (a cada límit de crugia) i forjats (a cada planta).
        for (let i = 0; i <= bays; i++) {
          const t0 = Math.max(0, i * w - hp);
          const t1 = Math.min(L, i * w + hp);
          front(concrete, t0, t1, yb, yTop, 0);
          if (i > 0) side(concrete, t0, yb, yTop, 0, D1, Um);
          if (i < bays) side(concrete, t1, yb, yTop, 0, D1, U);
        }
        for (let f = 0; f <= floors; f++) {
          const yf = yb + f * floorH;
          const y0 = f === 0 ? yb : yf - K.slab / 2;
          const y1 = f === floors ? yTop : f === 0 ? yb + K.slab : yf + K.slab / 2;
          front(concrete, 0, L, y0, y1, 0);
          if (f > 0) flat(concrete, 0, L, y0, 0, D1, DOWN);
          if (f < floors) flat(concrete, 0, L, y1, 0, D1, UP);
        }

        // Plafons de maó amb una finestra vertical per crugia i planta.
        for (let f = 0; f < floors; f++) {
          const y0 = f === 0 ? yb + K.slab : yb + f * floorH + K.slab / 2;
          const y1 = f === floors - 1 ? yTop - K.slab / 2 : yb + (f + 1) * floorH - K.slab / 2;
          for (let i = 0; i < bays; i++) {
            const t0 = i * w + hp;
            const t1 = (i + 1) * w - hp;
            const cw = t1 - t0;
            const ww = Math.min(1.0, cw * 0.32);
            const wx1 = t1 - 0.3;
            const wx0 = wx1 - ww;
            const wy0 = y0 + 0.3;
            const wy1 = y1 - 0.12;
            // Maó al voltant del buit.
            front(brick, t0, wx0, y0, y1, D1);
            front(brick, wx1, t1, y0, y1, D1);
            front(brick, wx0, wx1, y0, wy0, D1);
            front(brick, wx0, wx1, wy1, y1, D1);
            // Brancals, ampit i llinda.
            side(concrete, wx0, wy0, wy1, D1, D2, U);
            side(concrete, wx1, wy0, wy1, D1, D2, Um);
            flat(concrete, wx0, wx1, wy0, D1, D2, UP);
            flat(concrete, wx0, wx1, wy1, D1, D2, DOWN);
            front(glass, wx0, wx1, wy0, wy1, D2);
            // Lamel·les horitzontals davant del vidre.
            const slat = (wy1 - wy0) / K.louvers;
            for (let k = 0; k < K.louvers; k++) {
              const ly = wy0 + k * slat + slat * 0.25;
              front(louver, wx0 + 0.02, wx1 - 0.02, ly, ly + slat * 0.45, D1 - 0.04);
            }
          }
        }
      }
    }
  }
  return { brick: brick.build(), concrete: concrete.build(), glass: glass.build(), louver: louver.build() };
}
