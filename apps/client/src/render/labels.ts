import * as THREE from "three";
import type { BuildingData, Vec2 } from "@shutter/shared/map";

const LABEL_HEIGHT = 2.2;

function labelTexture(text: string): { texture: THREE.CanvasTexture; aspect: number } {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `800 200px "Inter", system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 40;
  canvas.width = w;
  canvas.height = 240;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#2a2a2c";
  ctx.fillText(text, w / 2, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, aspect: w / canvas.height };
}

interface Edge {
  a: Vec2;
  b: Vec2;
  len: number;
  nx: number;
  nz: number;
}

/** Dues façanes llargues amb orientacions ben diferents: el rètol es veu des dels dos costats principals. */
function labelEdges(footprint: Vec2[]): Edge[] {
  const edges: Edge[] = footprint.map((a, i) => {
    const b = footprint[(i + 1) % footprint.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    return { a, b, len, nx: dz / len, nz: -dx / len };
  });
  edges.sort((e1, e2) => e2.len - e1.len);
  const first = edges[0];
  const second = edges.find((e) => e.nx * first.nx + e.nz * first.nz < -0.3);
  return second ? [first, second] : [first];
}

export function createLabels(buildings: readonly BuildingData[]): THREE.Group {
  const group = new THREE.Group();
  group.name = "labels";
  for (const b of buildings) {
    if (!b.label || b.background) continue;
    const { texture, aspect } = labelTexture(b.label);
    const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.8, depthWrite: false });
    for (const e of labelEdges(b.footprint)) {
      const width = Math.min(LABEL_HEIGHT * aspect, e.len * 0.8);
      const height = width / aspect;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
      mesh.position.set((e.a[0] + e.b[0]) / 2 + e.nx * 0.06, b.baseY + b.height - 0.6 - height / 2, (e.a[1] + e.b[1]) / 2 + e.nz * 0.06);
      mesh.rotation.y = Math.atan2(e.nx, e.nz);
      mesh.renderOrder = 1;
      group.add(mesh);
    }
  }
  return group;
}
