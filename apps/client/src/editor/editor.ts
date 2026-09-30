import { type MapData, type Vec2, centroid } from "@shutter/shared/map";

export const REFERENCE_URL = "/maps/campus-nord-reference.json";

interface CatastroPart {
  id: string;
  ref: string;
  outer: Vec2[];
  holes: Vec2[][];
  floorsAbove: number;
  floorsBelow: number;
}

interface Reference {
  catastro: CatastroPart[];
}

interface Layers {
  ortho: boolean;
  game: boolean;
  catastro: boolean;
  labels: boolean;
}

/**
 * Editor del mapa (`?mode=editor`). De moment és una vista de comparació: l'ortofoto de l'ICGC de fons,
 * els edificis del joc (blau) i les parts del Cadastre (taronja).
 * Arrossega per moure't, roda per fer zoom; 1-4 activen o desactiven capes.
 */
export async function startEditor(canvas: HTMLCanvasElement, hud: HTMLElement, map: MapData, ortho: ImageBitmap | null): Promise<void> {
  const ref = (await (await fetch(REFERENCE_URL)).json()) as Reference;
  const ctx = canvas.getContext("2d")!;
  const t = map.terrain;
  const width = (t.cols - 1) * t.cellSize;
  const depth = (t.rows - 1) * t.cellSize;
  const campus = map.buildings.filter((b) => !b.background);

  const view = { x: -60, z: 30, scale: 2.2 };
  const layers: Layers = { ortho: true, game: true, catastro: true, labels: true };
  let hover: string[] = [];

  const panel = document.createElement("div");
  panel.className = "editor-panel";
  hud.replaceChildren(panel);

  const toScreen = (x: number, z: number): [number, number] => [
    (x - view.x) * view.scale + canvas.width / 2,
    (z - view.z) * view.scale + canvas.height / 2,
  ];
  const toWorld = (sx: number, sy: number): Vec2 => [
    (sx - canvas.width / 2) / view.scale + view.x,
    (sy - canvas.height / 2) / view.scale + view.z,
  ];

  const path = (ring: Vec2[]): void => {
    ring.forEach(([x, z], i) => {
      const [sx, sy] = toScreen(x, z);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
  };

  function draw(): void {
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(canvas.clientWidth * dpr)) {
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    }
    ctx.fillStyle = "#1a1d22";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (layers.ortho && ortho) {
      const [x0, y0] = toScreen(t.originX, t.originZ);
      ctx.drawImage(ortho, x0, y0, width * view.scale, depth * view.scale);
    }

    ctx.lineWidth = 1.5 * dpr;
    ctx.setLineDash([6 * dpr, 4 * dpr]);
    ctx.strokeStyle = "#ffe066";
    ctx.beginPath();
    path(map.playArea);
    ctx.stroke();
    ctx.setLineDash([]);

    if (layers.catastro) {
      ctx.strokeStyle = "#ff8a1f";
      ctx.fillStyle = "rgba(255, 138, 31, 0.12)";
      for (const p of ref.catastro) {
        ctx.beginPath();
        path(p.outer);
        for (const h of p.holes) path(h);
        ctx.fill("evenodd");
        ctx.stroke();
      }
    }
    if (layers.game) {
      ctx.strokeStyle = "#3fa4ff";
      ctx.lineWidth = 2 * dpr;
      for (const b of campus) {
        ctx.beginPath();
        path(b.footprint);
        ctx.stroke();
      }
    }
    if (layers.labels && view.scale > 1.2) {
      ctx.font = `${Math.round(11 * dpr)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (layers.catastro && view.scale > 3) {
        for (const p of ref.catastro) {
          const [sx, sy] = toScreen(...centroid(p.outer));
          ctx.fillStyle = "#ffcf99";
          ctx.fillText(`${p.floorsAbove}${p.floorsBelow ? `/−${p.floorsBelow}` : ""}`, sx, sy);
        }
      }
      if (layers.game) {
        ctx.fillStyle = "#cfe6ff";
        for (const b of campus) {
          const [sx, sy] = toScreen(...centroid(b.footprint));
          ctx.fillText(b.id, sx, sy - 12 * dpr);
        }
      }
    }
  }

  function updatePanel(): void {
    const lines = [
      "Editor del mapa · comparació",
      `Capes: [1] ortofoto ${on(layers.ortho)} · [2] joc (blau) ${on(layers.game)} · [3] Cadastre (taronja) ${on(layers.catastro)} · [4] etiquetes ${on(layers.labels)}`,
      "Arrossega per moure't · roda per fer zoom",
      ...hover,
    ];
    panel.replaceChildren(
      ...lines.map((text, i) => {
        const div = document.createElement("div");
        div.textContent = text;
        if (i === 0) div.className = "editor-title";
        return div;
      }),
    );
  }
  const on = (v: boolean): string => (v ? "✓" : "✗");

  function pointInRing([x, z]: Vec2, ring: Vec2[]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, zi] = ring[i];
      const [xj, zj] = ring[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }

  let drag: { x: number; y: number } | null = null;
  canvas.addEventListener("mousedown", (e) => {
    drag = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener("mouseup", () => {
    drag = null;
  });
  window.addEventListener("mousemove", (e) => {
    const dpr = window.devicePixelRatio || 1;
    if (drag) {
      view.x -= ((e.clientX - drag.x) * dpr) / view.scale;
      view.z -= ((e.clientY - drag.y) * dpr) / view.scale;
      drag = { x: e.clientX, y: e.clientY };
    }
    const p = toWorld(e.clientX * dpr, e.clientY * dpr);
    const parts = ref.catastro.filter((c) => pointInRing(p, c.outer));
    const game = campus.filter((b) => pointInRing(p, b.footprint));
    hover = [
      `x ${p[0].toFixed(1)} · z ${p[1].toFixed(1)}`,
      ...game.map((b) => `Joc: ${b.id} (${b.name || "sense nom"}) · ${b.levels} pl. · ${b.height.toFixed(1)} m`),
      ...parts.map((c) => `Cadastre: ${c.id} · ${c.floorsAbove} pl. sobre rasant${c.floorsBelow ? `, ${c.floorsBelow} sota` : ""}`),
    ];
    updatePanel();
    draw();
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const dpr = window.devicePixelRatio || 1;
      const before = toWorld(e.clientX * dpr, e.clientY * dpr);
      view.scale = Math.min(40, Math.max(0.3, view.scale * Math.exp(-e.deltaY * 0.0015)));
      const after = toWorld(e.clientX * dpr, e.clientY * dpr);
      view.x += before[0] - after[0];
      view.z += before[1] - after[1];
      draw();
    },
    { passive: false },
  );
  window.addEventListener("keydown", (e) => {
    const keys: Record<string, keyof Layers> = { Digit1: "ortho", Digit2: "game", Digit3: "catastro", Digit4: "labels" };
    const layer = keys[e.code];
    if (!layer) return;
    layers[layer] = !layers[layer];
    updatePanel();
    draw();
  });
  window.addEventListener("resize", draw);

  // Paràmetres per situar la vista des de l'URL: ?mode=editor&view=x,z,escala
  const v = new URLSearchParams(location.search).get("view")?.split(",").map(Number);
  if (v && v.length === 3 && v.every(Number.isFinite)) [view.x, view.z, view.scale] = v;
  updatePanel();
  draw();
}
