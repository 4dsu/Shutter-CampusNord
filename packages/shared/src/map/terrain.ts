import type { TerrainData } from "./types.ts";

export function encodeHeightsCm(heights: ArrayLike<number>): string {
  const bytes = new Uint8Array(heights.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < heights.length; i++) {
    view.setUint16(i * 2, Math.max(0, Math.min(65535, Math.round(heights[i] * 100))), true);
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function decodeHeightsCm(b64: string, count: number): Float32Array {
  const bin = atob(b64);
  if (bin.length !== count * 2) throw new Error(`Terreny: s'esperaven ${count * 2} bytes i n'hi ha ${bin.length}`);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = (bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8)) / 100;
  }
  return out;
}

/**
 * Camp d'alçades del terreny. Cada cel·la es divideix en dos triangles per la diagonal
 * (col, row) → (col + 1, row + 1); heightAt() interpola sobre aquests mateixos triangles,
 * de manera que coincideix exactament amb la malla de render i de col·lisions.
 */
export class TerrainField {
  readonly originX: number;
  readonly originZ: number;
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  readonly heights: Float32Array;

  constructor(originX: number, originZ: number, cellSize: number, cols: number, rows: number, heights: Float32Array) {
    if (heights.length !== cols * rows) throw new Error("TerrainField: mida d'alçades incorrecta");
    this.originX = originX;
    this.originZ = originZ;
    this.cellSize = cellSize;
    this.cols = cols;
    this.rows = rows;
    this.heights = heights;
  }

  static fromData(data: TerrainData): TerrainField {
    const heights = decodeHeightsCm(data.heightsCm, data.cols * data.rows);
    return new TerrainField(data.originX, data.originZ, data.cellSize, data.cols, data.rows, heights);
  }

  get maxX(): number {
    return this.originX + (this.cols - 1) * this.cellSize;
  }

  get maxZ(): number {
    return this.originZ + (this.rows - 1) * this.cellSize;
  }

  sample(col: number, row: number): number {
    const c = Math.max(0, Math.min(this.cols - 1, col));
    const r = Math.max(0, Math.min(this.rows - 1, row));
    return this.heights[r * this.cols + c];
  }

  heightAt(x: number, z: number): number {
    const gx = (x - this.originX) / this.cellSize;
    const gz = (z - this.originZ) / this.cellSize;
    const c = Math.max(0, Math.min(this.cols - 2, Math.floor(gx)));
    const r = Math.max(0, Math.min(this.rows - 2, Math.floor(gz)));
    const fx = Math.max(0, Math.min(1, gx - c));
    const fz = Math.max(0, Math.min(1, gz - r));
    const h00 = this.heights[r * this.cols + c];
    const h10 = this.heights[r * this.cols + c + 1];
    const h01 = this.heights[(r + 1) * this.cols + c];
    const h11 = this.heights[(r + 1) * this.cols + c + 1];
    return fz >= fx ? h00 + fz * (h01 - h00) + fx * (h11 - h01) : h00 + fx * (h10 - h00) + fz * (h11 - h10);
  }
}
