import {
  type BuildingData,
  FACADE_STYLES,
  type FacadeStyle,
  type MapCorrections,
  type MapData,
  TerrainField,
  type Vec2,
  centroid,
  distanceToSegment,
  emptyCorrections,
  pointInRing,
} from "@shutter/shared/map";

export const REFERENCE_URL = "/maps/campus-nord-reference.json";
const MAP_URL = "/maps/campus-nord.json";

interface CatastroPart {
  id: string;
  ref: string;
  outer: Vec2[];
  holes: Vec2[][];
  floorsAbove: number;
  floorsBelow: number;
}

interface Layers {
  ortho: boolean;
  game: boolean;
  catastro: boolean;
  labels: boolean;
}

type Tool = "select" | "building" | "platform" | "catastro";

const TOOL_NAMES: Record<Tool, string> = {
  select: "Seleccionar",
  building: "Nou edifici",
  platform: "Nova plaça plana",
  catastro: "Copiar del Cadastre",
};

const HANDLE_PX = 6;

/**
 * Editor del mapa (`?mode=editor`): ortofoto de l'ICGC de fons, edificis del joc (blau) i parts del Cadastre (taronja).
 * Les correccions es desen a tools/map-import/corrections.json a través del servidor de desenvolupament, que torna a
 * generar el mapa. Arrossega per moure't, roda per fer zoom; 1-4 activen capes.
 */
export async function startEditor(canvas: HTMLCanvasElement, hud: HTMLElement, initialMap: MapData, ortho: ImageBitmap | null): Promise<void> {
  let map = initialMap;
  let terrain = TerrainField.fromData(map.terrain);
  const ref = (await (await fetch(REFERENCE_URL)).json()) as { catastro: CatastroPart[] };
  let corrections: MapCorrections = emptyCorrections();
  let serverAvailable = false;
  try {
    const res = await fetch("/dev/corrections");
    if (res.ok) {
      serverAvailable = true;
      const data = (await res.json()) as MapCorrections | null;
      if (data) corrections = { ...emptyCorrections(), ...data };
    }
  } catch {
    // Sense servidor de desenvolupament: l'editor funciona, però no pot desar.
  }

  const ctx = canvas.getContext("2d")!;
  const view = { x: -60, z: 30, scale: 2.2 };
  const layers: Layers = { ortho: true, game: true, catastro: true, labels: true };
  let tool: Tool = "select";
  let selected: string | null = null;
  /** Contorn en edició de l'edifici seleccionat (còpia; es desa a `corrections` quan canvia). */
  let working: Vec2[] | null = null;
  let drawing: Vec2[] = [];
  let hoverInfo: string[] = [];
  let status = serverAvailable ? "" : "Sense servidor de desenvolupament (npm run dev): no es pot desar.";
  let dirty = false;

  const editable = (): BuildingData[] => map.buildings.filter((b) => !b.background);
  const byId = (id: string | null): BuildingData | undefined => (id ? map.buildings.find((b) => b.id === id) : undefined);
  const isAdded = (id: string): boolean => corrections.added.some((a) => a.id === id);
  const dpr = (): number => window.devicePixelRatio || 1;

  const toScreen = (x: number, z: number): [number, number] => [
    (x - view.x) * view.scale + canvas.width / 2,
    (z - view.z) * view.scale + canvas.height / 2,
  ];
  const toWorld = (sx: number, sy: number): Vec2 => [
    (sx - canvas.width / 2) / view.scale + view.x,
    (sy - canvas.height / 2) / view.scale + view.z,
  ];
  const eventWorld = (e: MouseEvent): Vec2 => {
    const r = canvas.getBoundingClientRect();
    return toWorld((e.clientX - r.left) * dpr(), (e.clientY - r.top) * dpr());
  };

  // ---------------------------------------------------------------------------------------------
  // Correccions

  function commitFootprint(): void {
    if (!selected || !working) return;
    const pts = working.map(([x, z]): Vec2 => [Math.round(x * 100) / 100, Math.round(z * 100) / 100]);
    const added = corrections.added.find((a) => a.id === selected);
    if (added) added.footprint = pts;
    else corrections.buildings[selected] = { ...corrections.buildings[selected], footprint: pts };
    const b = byId(selected);
    if (b) b.footprint = pts;
    dirty = true;
  }

  function setProperty(key: "levels" | "height" | "minHeight" | "facade" | "name", value: number | string | undefined): void {
    if (!selected) return;
    const added = corrections.added.find((a) => a.id === selected);
    const target = (added ?? (corrections.buildings[selected] ??= {})) as Record<string, unknown>;
    if (value === undefined || value === "") delete target[key];
    else target[key] = value;
    dirty = true;
  }

  function removeSelected(): void {
    if (!selected) return;
    if (isAdded(selected)) corrections.added = corrections.added.filter((a) => a.id !== selected);
    else corrections.buildings[selected] = { remove: true };
    map = { ...map, buildings: map.buildings.filter((b) => b.id !== selected) };
    select(null);
    dirty = true;
  }

  async function save(): Promise<void> {
    if (!serverAvailable) return;
    status = "Desant i regenerant el mapa…";
    render();
    const res = await fetch("/dev/corrections", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corrections),
    });
    const result = (await res.json()) as { ok?: boolean; log?: string; error?: string };
    if (!res.ok || !result.ok) {
      status = `Error en regenerar: ${result.error ?? result.log?.slice(-300) ?? res.status}`;
      render();
      return;
    }
    map = (await (await fetch(`${MAP_URL}?t=${Date.now()}`, { cache: "no-store" })).json()) as MapData;
    terrain = TerrainField.fromData(map.terrain);
    dirty = false;
    status = "Desat. Mapa regenerat (recarrega el joc per veure-ho en 3D).";
    select(selected && byId(selected) ? selected : null);
  }

  // ---------------------------------------------------------------------------------------------
  // Panell

  const panel = document.createElement("div");
  panel.className = "editor-panel";
  // La informació de sota el cursor va a part: si es redibuixés tot el panell, els camps perdrien el focus.
  const hoverBox = document.createElement("div");
  hoverBox.className = "editor-hover";
  hud.replaceChildren(panel, hoverBox);
  let collapsed = false;

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", className = ""): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function button(text: string, onClick: () => void, active = false): HTMLButtonElement {
    const b = el("button", text, active ? "active" : "");
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  function numberInput(label: string, value: number | undefined, onChange: (v: number | undefined) => void, step = 0.1): HTMLLabelElement {
    const wrap = el("label");
    wrap.append(el("span", label));
    const input = el("input");
    input.type = "number";
    input.step = String(step);
    input.value = value === undefined ? "" : String(value);
    input.addEventListener("change", () => onChange(input.value === "" ? undefined : Number(input.value)));
    wrap.append(input);
    return wrap;
  }

  function renderPanel(): void {
    const head = el("div", "", "editor-row");
    head.append(
      el("span", "Editor del mapa", "editor-title"),
      button(collapsed ? "Mostra" : "Amaga", () => {
        collapsed = !collapsed;
        renderPanel();
      }),
    );
    if (collapsed) {
      panel.replaceChildren(head);
      return;
    }
    const children: Node[] = [head];
    const tools = el("div", "", "editor-row");
    for (const t of Object.keys(TOOL_NAMES) as Tool[]) {
      tools.append(
        button(TOOL_NAMES[t], () => {
          tool = t;
          drawing = [];
          renderPanel();
          render();
        }, tool === t),
      );
    }
    children.push(tools);

    const b = byId(selected);
    if (b) {
      const corr = corrections.buildings[b.id];
      const added = corrections.added.find((a) => a.id === b.id);
      const box = el("div", "", "editor-box");
      box.append(el("div", `${b.id}${b.name ? ` · ${b.name}` : ""}${added ? " (nou)" : corr ? " (corregit)" : ""}`, "editor-title"));
      box.append(
        numberInput("Plantes", added?.levels ?? corr?.levels ?? b.levels, (v) => setProperty("levels", v), 1),
        numberInput("Alçada (m)", added?.height ?? corr?.height, (v) => setProperty("height", v)),
        numberInput("Comença a (m)", added?.minHeight ?? corr?.minHeight ?? (b.minHeight || undefined), (v) => setProperty("minHeight", v)),
      );
      const facade = el("select");
      for (const f of FACADE_STYLES) {
        const opt = el("option", f);
        opt.value = f;
        opt.selected = f === (added?.facade ?? corr?.facade ?? b.facade);
        facade.append(opt);
      }
      facade.addEventListener("change", () => setProperty("facade", facade.value as FacadeStyle));
      const facadeLabel = el("label");
      facadeLabel.append(el("span", "Façana"), facade);
      box.append(facadeLabel);
      const actions = el("div", "", "editor-row");
      actions.append(
        button("Copiar contorn del Cadastre", () => {
          tool = "catastro";
          renderPanel();
        }),
        button("Eliminar", removeSelected),
      );
      box.append(actions, el("div", "Arrossega els vèrtexs · doble clic en una aresta: nou vèrtex · clic dret: esborrar vèrtex", "hint"));
      children.push(box);
    }

    const help: Record<Tool, string> = {
      select: "Clica un edifici per seleccionar-lo.",
      building: "Clica per posar vèrtexs; Enter per acabar, Esc per cancel·lar.",
      platform: "Dibuixa una plaça o terrassa plana; Enter per acabar. Després pots canviar-ne l'alçada.",
      catastro: "Clica una part del Cadastre (taronja): el seu contorn passa a l'edifici seleccionat.",
    };
    children.push(el("div", help[tool], "hint"));

    if (corrections.platforms.length) {
      const list = el("div", "", "editor-box");
      list.append(el("div", "Places planes", "editor-title"));
      for (const p of corrections.platforms) {
        list.append(
          numberInput(`${p.id} · alçada (m s.n.m.)`, Math.round(p.elevation * 100) / 100, (v) => {
            if (v !== undefined) p.elevation = v;
            dirty = true;
          }),
        );
      }
      children.push(list);
    }

    const footer = el("div", "", "editor-row");
    footer.append(button(dirty ? "Desa i regenera ●" : "Desa i regenera", () => void save()));
    footer.append(el("span", `Capes: [1] foto ${on(layers.ortho)} [2] joc ${on(layers.game)} [3] Cadastre ${on(layers.catastro)} [4] noms ${on(layers.labels)}`, "hint"));
    children.push(footer);
    if (status) children.push(el("div", status, "editor-status"));
    panel.replaceChildren(...children);
  }

  function renderHover(): void {
    hoverBox.replaceChildren(...hoverInfo.map((line) => el("div", line)));
  }
  const on = (v: boolean): string => (v ? "✓" : "✗");

  function select(id: string | null): void {
    selected = id;
    const b = byId(id);
    working = b ? b.footprint.map((p): Vec2 => [p[0], p[1]]) : null;
    renderPanel();
    render();
  }

  // ---------------------------------------------------------------------------------------------
  // Dibuix

  const path = (ring: Vec2[], close = true): void => {
    ring.forEach(([x, z], i) => {
      const [sx, sy] = toScreen(x, z);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    if (close) ctx.closePath();
  };

  function render(): void {
    const d = dpr();
    if (canvas.width !== Math.round(canvas.clientWidth * d)) {
      canvas.width = Math.round(canvas.clientWidth * d);
      canvas.height = Math.round(canvas.clientHeight * d);
    }
    const t = map.terrain;
    ctx.fillStyle = "#1a1d22";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (layers.ortho && ortho) {
      const [x0, y0] = toScreen(t.originX, t.originZ);
      ctx.drawImage(ortho, x0, y0, (t.cols - 1) * t.cellSize * view.scale, (t.rows - 1) * t.cellSize * view.scale);
    }
    ctx.lineWidth = 1.5 * d;
    ctx.setLineDash([6 * d, 4 * d]);
    ctx.strokeStyle = "#ffe066";
    ctx.beginPath();
    path(map.playArea);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(220, 60, 220, 0.22)";
    ctx.strokeStyle = "#e45ce4";
    for (const p of corrections.platforms) {
      ctx.beginPath();
      path(p.ring);
      ctx.fill();
      ctx.stroke();
    }
    if (layers.catastro) {
      ctx.strokeStyle = "#ff8a1f";
      ctx.fillStyle = "rgba(255, 138, 31, 0.1)";
      for (const p of ref.catastro) {
        ctx.beginPath();
        path(p.outer);
        ctx.fill();
        ctx.stroke();
      }
    }
    if (layers.game) {
      ctx.lineWidth = 2 * d;
      for (const b of editable()) {
        if (b.id === selected) continue;
        ctx.strokeStyle = isAdded(b.id) ? "#4be38a" : corrections.buildings[b.id] ? "#7fd4ff" : "#3fa4ff";
        ctx.beginPath();
        path(b.footprint);
        ctx.stroke();
      }
    }
    if (working) {
      ctx.lineWidth = 2.5 * d;
      ctx.strokeStyle = "#ffe14d";
      ctx.fillStyle = "rgba(255, 225, 77, 0.15)";
      ctx.beginPath();
      path(working);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffe14d";
      for (const [x, z] of working) {
        const [sx, sy] = toScreen(x, z);
        ctx.fillRect(sx - HANDLE_PX * d * 0.5, sy - HANDLE_PX * d * 0.5, HANDLE_PX * d, HANDLE_PX * d);
      }
    }
    if (drawing.length) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2 * d;
      ctx.setLineDash([5 * d, 4 * d]);
      ctx.beginPath();
      path(drawing, false);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (layers.labels && view.scale > 1.2) {
      ctx.font = `${Math.round(11 * d)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (layers.catastro && view.scale > 3) {
        ctx.fillStyle = "#ffcf99";
        for (const p of ref.catastro) {
          const [sx, sy] = toScreen(...centroid(p.outer));
          ctx.fillText(`${p.floorsAbove}${p.floorsBelow ? `/−${p.floorsBelow}` : ""}`, sx, sy);
        }
      }
      if (layers.game) {
        ctx.fillStyle = "#e3f1ff";
        for (const b of editable()) {
          const [sx, sy] = toScreen(...centroid(b.footprint));
          ctx.fillText(b.id, sx, sy - 12 * d);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Interacció

  const handleAt = (p: Vec2): number => {
    if (!working) return -1;
    const tol = (HANDLE_PX * 1.5) / view.scale;
    return working.findIndex(([x, z]) => Math.abs(x - p[0]) < tol && Math.abs(z - p[1]) < tol);
  };

  function finishDrawing(): void {
    if (drawing.length < 3) {
      drawing = [];
      render();
      return;
    }
    if (tool === "building") {
      let n = 1;
      while (map.buildings.some((b) => b.id === `nou-${n}`)) n++;
      const id = `nou-${n}`;
      corrections.added.push({ id, footprint: drawing.slice(), levels: 1, facade: "strips" });
      const heights = drawing.map(([x, z]) => terrain.heightAt(x, z));
      const base = heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)];
      map.buildings.push({
        id,
        osmId: 0,
        name: "",
        kind: "university",
        footprint: drawing.slice(),
        holes: [],
        baseY: base,
        footY: base - 0.5,
        height: 3.6,
        minHeight: 0,
        levels: 1,
        color: "#d6d2c9",
        facade: "strips",
        roofColor: "#8f8c86",
        background: false,
        entrances: [],
      });
      tool = "select";
      select(id);
    } else if (tool === "platform") {
      const mean = drawing.reduce((s, [x, z]) => s + terrain.heightAt(x, z), 0) / drawing.length + map.datum;
      let n = 1;
      while (corrections.platforms.some((p) => p.id === `placa-${n}`)) n++;
      corrections.platforms.push({ id: `placa-${n}`, ring: drawing.slice(), elevation: Math.round(mean * 100) / 100 });
      tool = "select";
    }
    drawing = [];
    dirty = true;
    renderPanel();
    render();
  }

  let drag: { kind: "pan" | "vertex"; x: number; y: number; index: number } | null = null;

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const p = eventWorld(e);
    if (tool === "select") {
      const h = handleAt(p);
      if (h >= 0) {
        drag = { kind: "vertex", x: e.clientX, y: e.clientY, index: h };
        return;
      }
    }
    drag = { kind: "pan", x: e.clientX, y: e.clientY, index: -1 };
  });

  canvas.addEventListener("click", (e) => {
    const moved = drag && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 3;
    if (moved) return;
    const p = eventWorld(e);
    if (tool === "building" || tool === "platform") {
      drawing.push(p);
      render();
      return;
    }
    if (tool === "catastro") {
      const part = ref.catastro.find((c) => pointInRing(p, c.outer));
      if (part && selected) {
        working = part.outer.map((q): Vec2 => [q[0], q[1]]);
        commitFootprint();
        const b = byId(selected);
        if (b && part.floorsAbove > 0) {
          setProperty("levels", part.floorsAbove);
          b.levels = part.floorsAbove;
        }
      }
      tool = "select";
      renderPanel();
      render();
      return;
    }
    const hit = editable()
      .filter((b) => pointInRing(p, b.footprint))
      .sort((a, b) => Math.abs(areaOf(a.footprint)) - Math.abs(areaOf(b.footprint)))[0];
    select(hit?.id ?? null);
  });

  canvas.addEventListener("dblclick", (e) => {
    if (tool !== "select" || !working) return;
    const p = eventWorld(e);
    let best = -1;
    let bestD = 8 / view.scale;
    for (let i = 0; i < working.length; i++) {
      const d = distanceToSegment(p, working[i], working[(i + 1) % working.length]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      working.splice(best + 1, 0, p);
      commitFootprint();
      renderPanel();
      render();
    }
  });

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const h = handleAt(eventWorld(e));
    if (h >= 0 && working && working.length > 3) {
      working.splice(h, 1);
      commitFootprint();
      renderPanel();
      render();
    }
  });

  window.addEventListener("mouseup", () => {
    if (drag?.kind === "vertex") {
      commitFootprint();
      renderPanel();
    }
    // `click` arriba després de `mouseup`: el desplaçament es comprova amb la posició inicial.
    setTimeout(() => {
      drag = null;
    }, 0);
  });

  window.addEventListener("mousemove", (e) => {
    const p = eventWorld(e);
    if (drag?.kind === "pan") {
      view.x -= ((e.clientX - drag.x) * dpr()) / view.scale;
      view.z -= ((e.clientY - drag.y) * dpr()) / view.scale;
      drag.x = e.clientX;
      drag.y = e.clientY;
      render();
      return;
    }
    if (drag?.kind === "vertex" && working) {
      working[drag.index] = p;
      render();
      return;
    }
    const parts = ref.catastro.filter((c) => pointInRing(p, c.outer));
    const game = editable().filter((b) => pointInRing(p, b.footprint));
    hoverInfo = [
      `x ${p[0].toFixed(1)} · z ${p[1].toFixed(1)} · terreny ${(terrain.heightAt(p[0], p[1]) + map.datum).toFixed(1)} m`,
      ...game.map((b) => `Joc: ${b.id} ${b.name ? `(${b.name})` : ""} · ${b.levels} pl. · ${b.height.toFixed(1)} m`),
      ...parts.map((c) => `Cadastre: ${c.id} · ${c.floorsAbove} pl.${c.floorsBelow ? ` (+${c.floorsBelow} sota rasant)` : ""}`),
    ];
    renderHover();
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const before = eventWorld(e);
      view.scale = Math.min(60, Math.max(0.3, view.scale * Math.exp(-e.deltaY * 0.0015)));
      const after = eventWorld(e);
      view.x += before[0] - after[0];
      view.z += before[1] - after[1];
      render();
    },
    { passive: false },
  );

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const keys: Record<string, keyof Layers> = { Digit1: "ortho", Digit2: "game", Digit3: "catastro", Digit4: "labels" };
    if (keys[e.code]) {
      layers[keys[e.code]] = !layers[keys[e.code]];
      renderPanel();
      render();
    } else if (e.code === "Enter") {
      finishDrawing();
    } else if (e.code === "Escape") {
      drawing = [];
      tool = "select";
      select(null);
    } else if ((e.code === "Delete" || e.code === "Backspace") && selected && confirm(`Eliminar ${selected}?`)) {
      removeSelected();
    }
  });
  window.addEventListener("resize", render);
  window.addEventListener("beforeunload", (e) => {
    if (dirty) e.preventDefault();
  });

  // Paràmetres per situar la vista des de l'URL: ?mode=editor&view=x,z,escala
  const v = new URLSearchParams(location.search).get("view")?.split(",").map(Number);
  if (v && v.length === 3 && v.every(Number.isFinite)) [view.x, view.z, view.scale] = v;
  renderPanel();
  render();
}

function areaOf(ring: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}
