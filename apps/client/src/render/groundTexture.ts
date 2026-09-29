import * as THREE from "three";
import type { AreaKind, MapData, PathKind, TerrainField, Vec2 } from "@shutter/shared/map";

const AREA_COLORS: Record<AreaKind, string> = {
  wood: "#5a8543",
  grass: "#7ea258",
  pitch: "#5f9a4c",
  flowerbed: "#667f3d",
  dirt: "#a88f6c",
  parking: "#66686b",
  asphalt: "#5c5e61",
  paving: "#b3ac9d",
  water: "#4e8db5",
};

/** Ordre de pintat: primer el que queda a sota. */
const AREA_ORDER: AreaKind[] = ["wood", "grass", "pitch", "flowerbed", "dirt", "parking", "asphalt", "paving", "water"];

const PATH_STYLE: Record<PathKind, { color: string; edge?: string }> = {
  street: { color: "#56595d", edge: "#8f8b83" },
  service: { color: "#8f8b83" },
  cycleway: { color: "#9b5d4c" },
  path: { color: "#c9b99c" },
  footway: { color: "#bfb7a6" },
  pedestrian: { color: "#b9b1a0" },
  steps: { color: "#cbc3b2" },
};

const PATH_ORDER: PathKind[] = ["street", "service", "cycleway", "path", "pedestrian", "footway", "steps"];

/**
 * Pinta el terra (zones, camins, ombres de contacte dels edificis) en un canvas que es projecta sobre el terreny.
 * També serveix de base per al minimapa.
 */
export function bakeGround(map: MapData, terrain: TerrainField, metersPerPixel: number): HTMLCanvasElement {
  const width = (terrain.cols - 1) * terrain.cellSize;
  const depth = (terrain.rows - 1) * terrain.cellSize;
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(4096, Math.ceil(width / metersPerPixel));
  canvas.height = Math.min(4096, Math.ceil(depth / metersPerPixel));
  const ctx = canvas.getContext("2d")!;
  const sx = canvas.width / width;
  const sz = canvas.height / depth;
  ctx.setTransform(sx, 0, 0, sz, -terrain.originX * sx, -terrain.originZ * sz);

  const ring = (pts: Vec2[]): void => {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  };

  // Fons: ciutat fora del campus, paviment clar a dins.
  ctx.fillStyle = "#96938b";
  ctx.fillRect(terrain.originX, terrain.originZ, width, depth);
  ctx.beginPath();
  ring(map.playArea);
  ctx.fillStyle = "#a9a293";
  ctx.fill();

  for (const kind of AREA_ORDER) {
    ctx.fillStyle = AREA_COLORS[kind];
    for (const a of map.areas) {
      if (a.kind !== kind) continue;
      ctx.beginPath();
      ring(a.ring);
      for (const h of a.holes) ring(h);
      ctx.fill("evenodd");
    }
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const kind of PATH_ORDER) {
    const style = PATH_STYLE[kind];
    for (const pass of style.edge ? ["edge", "fill"] : ["fill"]) {
      ctx.strokeStyle = pass === "edge" ? style.edge! : style.color;
      for (const p of map.paths) {
        if (p.kind !== kind) continue;
        ctx.lineWidth = pass === "edge" ? p.width + 1.2 : p.width;
        ctx.beginPath();
        ctx.moveTo(p.points[0][0], p.points[0][1]);
        for (let i = 1; i < p.points.length; i++) ctx.lineTo(p.points[i][0], p.points[i][1]);
        ctx.stroke();
      }
    }
  }

  // Esglaons: ratlles perpendiculars al camí cada 0,4 m.
  ctx.strokeStyle = "rgba(90, 80, 65, 0.35)";
  ctx.lineWidth = 0.08;
  for (const p of map.paths) {
    if (p.kind !== "steps") continue;
    for (let i = 1; i < p.points.length; i++) {
      const [ax, az] = p.points[i - 1];
      const [bx, bz] = p.points[i];
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      for (let t = 0.2; t < len; t += 0.4) {
        const cx = ax + ((bx - ax) * t) / len;
        const cz = az + ((bz - az) * t) / len;
        ctx.beginPath();
        ctx.moveTo(cx - (nx * p.width) / 2, cz - (nz * p.width) / 2);
        ctx.lineTo(cx + (nx * p.width) / 2, cz + (nz * p.width) / 2);
        ctx.stroke();
      }
    }
  }

  // Ombra de contacte al voltant dels edificis (oclusió ambiental falsa).
  ctx.save();
  ctx.filter = `blur(${Math.max(1, 1.6 * sx)}px)`;
  ctx.fillStyle = "rgba(40, 36, 30, 0.45)";
  for (const b of map.buildings) {
    if (b.minHeight > 0) continue;
    ctx.beginPath();
    ring(b.footprint);
    ctx.fill();
  }
  ctx.restore();

  return canvas;
}

export function groundTexture(canvas: HTMLCanvasElement, renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false; // fila 0 del canvas = z mínima = uv.v 0
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
