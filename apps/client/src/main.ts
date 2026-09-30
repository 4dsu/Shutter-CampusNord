import { startEditor } from "./editor/editor.ts";
import { startGame } from "./game/game.ts";
import { MAP_URL, createSceneContext } from "./render/scene.ts";
import { loadMap } from "./render/world.ts";
import { startViewer } from "./viewer.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const hud = document.querySelector<HTMLDivElement>("#hud")!;
const mode = new URLSearchParams(location.search).get("mode");

const loading = document.createElement("div");
loading.className = "viewer-info";
loading.textContent = "Carregant el Campus Nord…";
hud.replaceChildren(loading);

if (mode === "editor") {
  // L'editor és 2D: no cal WebGL.
  const { map, ortho } = await loadMap(MAP_URL);
  await startEditor(canvas, hud, map, ortho);
} else {
  const ctx = await createSceneContext(canvas);
  if (mode === "viewer") startViewer(ctx, hud);
  else await startGame(ctx, hud);
}
