import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { PropData, PropKind, TerrainField } from "@shutter/shared/map";
import { type TreeKind, createTrees } from "./trees.ts";

const TREE_KINDS: readonly PropKind[] = ["tree", "conifer", "palm", "shrub"] satisfies TreeKind[];

/** Peça low-poly: geometria + color + transformació local. */
function part(geom: THREE.BufferGeometry, color: string, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]): THREE.BufferGeometry {
  const g = geom.index ? geom.toNonIndexed() : geom;
  g.deleteAttribute("uv");
  g.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
      new THREE.Vector3(...scale),
    ),
  );
  g.computeVertexNormals(); // no indexada → normals planes (aspecte low-poly)
  const c = new THREE.Color(color);
  const colors = new Float32Array(g.getAttribute("position").count * 3);
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = c.r;
    colors[i + 1] = c.g;
    colors[i + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg);

/** Models modelats mirant cap a +z, amb l'origen a terra. Els arbres fan ~10 m (escala 1). */
function propGeometry(kind: PropKind): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  switch (kind) {
    case "lamp":
      // Fanal de campus: pal alt amb globus blanc.
      parts.push(part(cyl(0.06, 0.1, 4.4), "#4a4f55", [0, 2.2, 0]));
      parts.push(part(new THREE.IcosahedronGeometry(0.28, 1), "#eeeeea", [0, 4.62, 0]));
      break;
    case "bench":
      parts.push(part(box(1.8, 0.07, 0.42), "#8a6a4a", [0, 0.45, 0.02]));
      parts.push(part(box(1.8, 0.42, 0.06), "#8a6a4a", [0, 0.72, -0.2], [-0.15, 0, 0]));
      for (const x of [-0.75, 0.75]) parts.push(part(box(0.07, 0.45, 0.46), "#43464a", [x, 0.22, 0]));
      break;
    case "picnic_table":
      parts.push(part(box(1.9, 0.06, 0.8), "#8d6c4b", [0, 0.75, 0]));
      for (const z of [-0.65, 0.65]) parts.push(part(box(1.9, 0.05, 0.28), "#8d6c4b", [0, 0.45, z]));
      for (const x of [-0.8, 0.8]) parts.push(part(box(0.08, 0.75, 1.5), "#5f4a36", [x, 0.37, 0]));
      break;
    case "waste_basket":
      parts.push(part(cyl(0.22, 0.2, 0.8, 8), "#4b5b4c", [0, 0.4, 0]));
      break;
    case "bicycle_parking":
      for (const x of [-1.2, 0, 1.2]) {
        parts.push(part(box(0.06, 0.8, 0.06), "#9aa0a6", [x, 0.4, -0.35]));
        parts.push(part(box(0.06, 0.8, 0.06), "#9aa0a6", [x, 0.4, 0.35]));
        parts.push(part(box(0.06, 0.06, 0.76), "#9aa0a6", [x, 0.8, 0]));
      }
      break;
    case "planter":
      parts.push(part(box(1.2, 0.6, 1.2), "#8f877b", [0, 0.3, 0]));
      parts.push(part(new THREE.IcosahedronGeometry(0.55, 0), "#5c8a3c", [0, 0.8, 0], [0, 0, 0], [1, 0.6, 1]));
      break;
    case "drinking_water":
      parts.push(part(cyl(0.14, 0.18, 1.0, 8), "#5d6e62", [0, 0.5, 0]));
      parts.push(part(box(0.3, 0.06, 0.3), "#5d6e62", [0, 1.0, 0.1]));
      break;
    case "vending_machine":
      parts.push(part(box(0.95, 1.85, 0.8), "#b23a3a", [0, 0.92, 0]));
      parts.push(part(box(0.6, 1.1, 0.02), "#20262c", [-0.1, 1.15, 0.41]));
      break;
  }
  const merged = mergeGeometries(parts)!;
  merged.computeBoundingSphere();
  return merged;
}

export function createProps(props: readonly PropData[], terrain: TerrainField): THREE.Group {
  const group = new THREE.Group();
  group.name = "props";
  // La vegetació té el seu propi mòdul (copes arrodonides, variants i material de fulles).
  group.add(createTrees(props, terrain));
  const byKind = new Map<PropKind, PropData[]>();
  for (const p of props) {
    if (TREE_KINDS.includes(p.kind)) continue;
    if (!byKind.has(p.kind)) byKind.set(p.kind, []);
    byKind.get(p.kind)!.push(p);
  }
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const s = new THREE.Vector3();
  const t = new THREE.Vector3();
  for (const [kind, list] of byKind) {
    const mesh = new THREE.InstancedMesh(propGeometry(kind), material, list.length);
    mesh.name = kind;
    list.forEach((p, i) => {
      q.setFromAxisAngle(up, p.rot);
      s.setScalar(p.scale);
      // Una mica enterrat perquè no quedi flotant en pendents.
      t.set(p.pos[0], terrain.heightAt(p.pos[0], p.pos[1]) - 0.05, p.pos[1]);
      mesh.setMatrixAt(i, m.compose(t, q, s));
    });
    mesh.castShadow = kind !== "waste_basket";
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
