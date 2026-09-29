import * as THREE from "three";
import { bounds, centroid } from "@shutter/shared/map";
import { FlyControls } from "./debug/flyControls.ts";
import { createEnvironment } from "./render/environment.ts";
import { createWorld, loadMap } from "./render/world.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const hud = document.querySelector<HTMLDivElement>("#hud")!;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 5000);
const env = createEnvironment(renderer, scene);

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

const loading = document.createElement("div");
loading.className = "viewer-info";
loading.textContent = "Carregant el Campus Nord…";
hud.replaceChildren(loading);

const loaded = await loadMap("/maps/campus-nord.json");
const { map, terrain } = loaded;
const world = createWorld(loaded, renderer);
scene.add(world.group);

const controls = new FlyControls(camera, canvas);
const camParam = new URLSearchParams(location.search).get("cam")?.split(",").map(Number);
if (camParam && camParam.length >= 5 && camParam.every(Number.isFinite)) {
  camera.position.set(camParam[0], camParam[1], camParam[2]);
  controls.yaw = camParam[3];
  controls.pitch = camParam[4];
} else {
  const b = bounds(map.playArea);
  const center = new THREE.Vector3((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
  center.y = terrain.heightAt(center.x, center.z);
  camera.position.set(center.x + 60, center.y + 90, center.z + 190);
  controls.lookAt(center);
}

const labelled = map.buildings.filter((b) => !b.background).map((b) => ({ name: b.name || b.id, c: centroid(b.footprint) }));
const info = document.createElement("div");
info.className = "viewer-info";
hud.replaceChildren(info);

function line(...children: (Node | string)[]): HTMLDivElement {
  const el = document.createElement("div");
  el.append(...children);
  return el;
}
function bold(text: string): HTMLElement {
  const el = document.createElement("b");
  el.textContent = text;
  return el;
}
function hint(text: string): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = "hint";
  el.textContent = text;
  return el;
}

let frames = 0;
let fps = 0;
let fpsTime = performance.now();
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  controls.update(dt);
  env.update(camera.position);
  renderer.render(scene, camera);

  frames++;
  const now = performance.now();
  if (now - fpsTime > 500) {
    fps = (frames * 1000) / (now - fpsTime);
    frames = 0;
    fpsTime = now;
    const p = camera.position;
    let nearest = labelled[0];
    let best = Infinity;
    for (const l of labelled) {
      const d = Math.hypot(l.c[0] - p.x, l.c[1] - p.z);
      if (d < best) {
        best = d;
        nearest = l;
      }
    }
    info.replaceChildren(
      line(bold("Shutter Campus Nord"), " · visor del mapa"),
      line(
        `${fps.toFixed(0)} FPS · ${renderer.info.render.calls} draw calls · ` +
          `${(renderer.info.render.triangles / 1000).toFixed(0)}k triangles`,
      ),
      line(`x ${p.x.toFixed(0)} · z ${p.z.toFixed(0)} · alçada ${(p.y + map.datum).toFixed(0)} m · a prop de `, bold(nearest?.name ?? "—")),
      line(hint("Clica per moure't · WASD · Espai/Q amunt/avall · Maj. per córrer")),
    );
  }
});
