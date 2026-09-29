import * as THREE from "three";
import { type Environment, createEnvironment } from "./environment.ts";
import { type LoadedMap, type World, createWorld, loadMap } from "./world.ts";

export const MAP_URL = "/maps/campus-nord.json";

/** Escena comuna al joc i al visor: renderer, càmera, cel i món del campus. */
export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  env: Environment;
  loaded: LoadedMap;
  world: World;
  /** Crida `listener` quan canvia la mida de la finestra (i una vegada d'entrada). */
  onResize(listener: (width: number, height: number) => void): void;
}

export async function createSceneContext(canvas: HTMLCanvasElement): Promise<SceneContext> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.55;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 5000);
  const env = createEnvironment(renderer, scene);

  const listeners: ((w: number, h: number) => void)[] = [];
  const resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    for (const l of listeners) l(w, h);
  };
  window.addEventListener("resize", resize);
  resize();

  const loaded = await loadMap(MAP_URL);
  const world = createWorld(loaded, renderer);
  scene.add(world.group);

  return {
    renderer,
    scene,
    camera,
    env,
    loaded,
    world,
    onResize(listener) {
      listeners.push(listener);
      listener(window.innerWidth, window.innerHeight);
    },
  };
}
