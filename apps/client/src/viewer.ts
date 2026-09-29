import * as THREE from "three";
import { bounds, centroid } from "@shutter/shared/map";
import { FlyControls } from "./debug/flyControls.ts";
import type { SceneContext } from "./render/scene.ts";

/**
 * Visor del mapa amb càmera lliure (`?mode=viewer`). `?cam=x,y,z,yaw,pitch` situa la càmera en un punt concret.
 */
export function startViewer(ctx: SceneContext, hud: HTMLElement): void {
  const { renderer, scene, camera, env } = ctx;
  const { map, terrain } = ctx.loaded;
  const canvas = renderer.domElement;

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

  const line = (...children: (Node | string)[]): HTMLDivElement => {
    const el = document.createElement("div");
    el.append(...children);
    return el;
  };
  const tag = (name: string, text: string, className?: string): HTMLElement => {
    const el = document.createElement(name);
    el.textContent = text;
    if (className) el.className = className;
    return el;
  };

  let frames = 0;
  let fpsTime = performance.now();
  const clock = new THREE.Clock();

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    controls.update(dt);
    env.update(camera.position);
    renderer.render(scene, camera);

    frames++;
    const now = performance.now();
    if (now - fpsTime < 500) return;
    const fps = (frames * 1000) / (now - fpsTime);
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
      line(tag("b", "Shutter Campus Nord"), " · visor del mapa"),
      line(
        `${fps.toFixed(0)} FPS · ${renderer.info.render.calls} draw calls · ` +
          `${(renderer.info.render.triangles / 1000).toFixed(0)}k triangles`,
      ),
      line(`x ${p.x.toFixed(0)} · z ${p.z.toFixed(0)} · alçada ${(p.y + map.datum).toFixed(0)} m · a prop de `, tag("b", nearest?.name ?? "—")),
      line(tag("span", "Clica per moure't · WASD · Espai/Q amunt/avall · Maj. per córrer", "hint")),
    );
  });
}
