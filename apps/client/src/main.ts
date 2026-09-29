import { startGame } from "./game/game.ts";
import { createSceneContext } from "./render/scene.ts";
import { startViewer } from "./viewer.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const hud = document.querySelector<HTMLDivElement>("#hud")!;

const loading = document.createElement("div");
loading.className = "viewer-info";
loading.textContent = "Carregant el Campus Nord…";
hud.replaceChildren(loading);

const ctx = await createSceneContext(canvas);
if (new URLSearchParams(location.search).get("mode") === "viewer") startViewer(ctx, hud);
else await startGame(ctx, hud);
