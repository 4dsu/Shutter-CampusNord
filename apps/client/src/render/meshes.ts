import * as THREE from "three";
import { COLOR_ATTR, type MeshData } from "@shutter/shared/map";

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Converteix una MeshData compartida en BufferGeometry de Three.js. */
export function toBufferGeometry(mesh: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(mesh.uvs, 2));
  for (const [name, attr] of Object.entries(mesh.attributes)) {
    // Els colors de les dades són sRGB; Three.js treballa en lineal.
    const array = name === COLOR_ATTR ? attr.array.map(srgbToLinear) : attr.array;
    g.setAttribute(name, new THREE.BufferAttribute(array, attr.itemSize));
  }
  g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}
