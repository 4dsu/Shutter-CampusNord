import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { PropData, TerrainField } from "@shutter/shared/map";
import { mulberry32 } from "@shutter/shared/sim";

export type TreeKind = "tree" | "conifer" | "palm" | "shrub";

const VARIANTS = 3;

/** Soroll de valor 3D senzill i determinista (per deformar les copes). */
function noise3(x: number, y: number, z: number): number {
  const h = (i: number, j: number, k: number): number => {
    const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  return lerp(
    lerp(lerp(h(xi, yi, zi), h(xi + 1, yi, zi), u), lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    lerp(lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}

/** Mata de fulles: esfera subdividida, deformada amb soroll i amb color per vèrtex (més fosc a sota). */
function clump(radius: number, center: THREE.Vector3, squashY: number, dark: THREE.Color, light: THREE.Color, seed: number): THREE.BufferGeometry {
  const base = new THREE.IcosahedronGeometry(radius, 1); // 80 triangles: prou rodó amb normals suaus
  base.deleteAttribute("uv");
  base.deleteAttribute("normal");
  const g = mergeVertices(base);
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const dir = p.clone().normalize();
    const n = noise3(p.x * 0.9 + seed, p.y * 0.9, p.z * 0.9 - seed);
    p.addScaledVector(dir, (n - 0.45) * radius * 0.55);
    p.y *= squashY;
    pos.setXYZ(i, p.x + center.x, p.y + center.y, p.z + center.z);
    // Més clar a dalt i a fora, més fosc a sota (oclusió aproximada).
    const up = THREE.MathUtils.clamp(0.5 + dir.y * 0.5, 0, 1);
    c.copy(dark).lerp(light, up * 0.8 + n * 0.3);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g.toNonIndexed();
}

function branch(from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number): THREE.BufferGeometry {
  const len = from.distanceTo(to);
  const g = new THREE.CylinderGeometry(r1, r0, len, 6, 1);
  g.deleteAttribute("uv");
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()));
  g.translate(from.x, from.y, from.z);
  return g.index ? g.toNonIndexed() : g;
}

interface TreeGeometry {
  bark: THREE.BufferGeometry;
  leaves: THREE.BufferGeometry;
}

const hex = (s: string): THREE.Color => new THREE.Color(s);

/** Plàtan / arbre de fulla ampla (~10 m a escala 1): tronc amb branques i copa de 6–8 mates. */
function broadleaf(seed: number): TreeGeometry {
  const rand = mulberry32(seed);
  const bark: THREE.BufferGeometry[] = [branch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 4.3, 0), 0.26, 0.17)];
  const leaves: THREE.BufferGeometry[] = [];
  const clumps = 6 + Math.floor(rand() * 3);
  for (let i = 0; i < clumps; i++) {
    const a = (i / clumps) * Math.PI * 2 + rand() * 0.6;
    const r = 1.6 + rand() * 1.4;
    const center = new THREE.Vector3(Math.cos(a) * r, 6.2 + rand() * 2.2, Math.sin(a) * r);
    if (i < 4) bark.push(branch(new THREE.Vector3(0, 4.0, 0), center.clone().multiplyScalar(0.8).setY(center.y - 0.8), 0.12, 0.05));
    leaves.push(clump(1.7 + rand() * 0.8, center, 0.85, hex("#2f4a22"), hex("#6f9142"), seed * 13 + i));
  }
  leaves.push(clump(2.2, new THREE.Vector3(0, 8.4, 0), 0.8, hex("#35512a"), hex("#789a48"), seed * 7));
  return { bark: mergeGeometries(bark)!, leaves: mergeGeometries(leaves)! };
}

/** Pi pinyoner (típic de Barcelona): tronc alt i una mica inclinat, copa ampla i aplanada. */
function umbrellaPine(seed: number): TreeGeometry {
  const rand = mulberry32(seed);
  const lean = new THREE.Vector3((rand() - 0.5) * 1.2, 7.6, (rand() - 0.5) * 1.2);
  const bark: THREE.BufferGeometry[] = [branch(new THREE.Vector3(0, 0, 0), lean, 0.28, 0.16)];
  const leaves: THREE.BufferGeometry[] = [];
  const clumps = 6 + Math.floor(rand() * 2);
  for (let i = 0; i < clumps; i++) {
    const a = (i / clumps) * Math.PI * 2 + rand() * 0.5;
    const r = 1.8 + rand() * 1.6;
    const center = new THREE.Vector3(lean.x + Math.cos(a) * r, lean.y + 0.9 + rand() * 0.7, lean.z + Math.sin(a) * r);
    bark.push(branch(lean.clone().setY(lean.y - 0.6), center.clone().setY(center.y - 0.3), 0.1, 0.05));
    leaves.push(clump(1.6 + rand() * 0.6, center, 0.45, hex("#23391f"), hex("#4f6b35"), seed * 11 + i));
  }
  leaves.push(clump(2.0, lean.clone().setY(lean.y + 1.4), 0.4, hex("#253c20"), hex("#55723a"), seed * 5));
  return { bark: mergeGeometries(bark)!, leaves: mergeGeometries(leaves)! };
}

function palm(seed: number): TreeGeometry {
  const rand = mulberry32(seed);
  const top = new THREE.Vector3((rand() - 0.5) * 0.8, 8.2, (rand() - 0.5) * 0.8);
  const bark = branch(new THREE.Vector3(0, 0, 0), top, 0.27, 0.2);
  const fronds: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand() * 0.3;
    const g = new THREE.PlaneGeometry(0.7, 3.4, 1, 4);
    g.deleteAttribute("uv");
    // Fulla corbada cap avall.
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) {
      const y = pos.getY(v) + 1.7;
      pos.setXYZ(v, pos.getX(v) * (1 - y / 3.6), -0.12 * y * y, y);
    }
    g.rotateY(a);
    g.translate(top.x, top.y, top.z);
    const colors = new Float32Array(pos.count * 3).fill(0);
    const c = hex(i % 2 ? "#4d7a33" : "#5f8a3c");
    for (let v = 0; v < pos.count; v++) colors.set([c.r, c.g, c.b], v * 3);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    fronds.push(g.toNonIndexed());
  }
  return { bark, leaves: mergeGeometries(fronds)! };
}

function shrub(seed: number): TreeGeometry {
  const rand = mulberry32(seed);
  const leaves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    leaves.push(
      clump(0.55 + rand() * 0.25, new THREE.Vector3((rand() - 0.5) * 0.8, 0.5 + rand() * 0.2, (rand() - 0.5) * 0.8), 0.8, hex("#2e4724"), hex("#5d7e3a"), seed + i),
    );
  }
  return { bark: branch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.3, 0), 0.05, 0.04), leaves: mergeGeometries(leaves)! };
}

const BUILDERS: Record<TreeKind, (seed: number) => TreeGeometry> = { tree: broadleaf, conifer: umbrellaPine, palm, shrub };

/** Material de fulles: color per vèrtex + soroll de fulles al shader (clapes i relleu petit). */
function foliageMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLeafPos;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
{
  vec4 lp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  lp = instanceMatrix * lp;
  #endif
  vLeafPos = (modelMatrix * lp).xyz;
}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vLeafPos;
float leafHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float leafNoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(leafHash(i), leafHash(i + vec3(1,0,0)), f.x), mix(leafHash(i + vec3(0,1,0)), leafHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(leafHash(i + vec3(0,0,1)), leafHash(i + vec3(1,0,1)), f.x), mix(leafHash(i + vec3(0,1,1)), leafHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float leafDetail;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
leafDetail = leafNoise(vLeafPos * 2.4) * 0.55 + leafNoise(vLeafPos * 8.3) * 0.45;
diffuseColor.rgb *= 0.55 + 0.75 * leafDetail;`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
normal = normalize(normal + vec3(dFdx(leafDetail), dFdy(leafDetail), 0.0) * 6.0);`,
      );
  };
  mat.customProgramCacheKey = () => "foliage-v1";
  return mat;
}

/** Arbres i arbustos instanciats, amb 3 variants per tipus perquè no siguin tots iguals. */
export function createTrees(props: readonly PropData[], terrain: TerrainField): THREE.Group {
  const group = new THREE.Group();
  group.name = "trees";
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1, flatShading: true });
  const leafMat = foliageMaterial();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const s = new THREE.Vector3();
  const t = new THREE.Vector3();

  for (const kind of Object.keys(BUILDERS) as TreeKind[]) {
    const list = props.filter((p) => p.kind === kind);
    if (list.length === 0) continue;
    for (let v = 0; v < VARIANTS; v++) {
      const items = list.filter((_, i) => i % VARIANTS === v);
      if (items.length === 0) continue;
      const geo = BUILDERS[kind](v * 101 + kind.length * 17 + 3);
      const bark = new THREE.InstancedMesh(geo.bark, barkMat, items.length);
      const leaves = new THREE.InstancedMesh(geo.leaves, leafMat, items.length);
      items.forEach((p, i) => {
        q.setFromAxisAngle(up, p.rot);
        s.setScalar(p.scale);
        t.set(p.pos[0], terrain.heightAt(p.pos[0], p.pos[1]) - 0.05, p.pos[1]);
        m.compose(t, q, s);
        bark.setMatrixAt(i, m);
        leaves.setMatrixAt(i, m);
      });
      for (const mesh of [bark, leaves]) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        group.add(mesh);
      }
    }
  }
  return group;
}
