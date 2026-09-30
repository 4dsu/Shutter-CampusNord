import * as THREE from "three";
import { mulberry32 } from "@shutter/shared/sim";

/**
 * Textures procedurals: es dibuixen per codi en un canvas (color, alçada → normal, rugositat).
 * No s'hi fa servir cap imatge externa; les fotos del campus (Mapillary, pròpies) només serveixen de referència
 * per triar colors, mides i aparells.
 */
export interface PbrTextures {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

export type TextureName = "facadeBrick" | "paverBrick" | "concretePaver" | "concrete" | "plaster" | "stone";

interface Recipe {
  /** Metres reals que cobreix una repetició. */
  tile: [number, number];
  size: number;
  draw: (g: Painter) => void;
}

/** Utilitats de dibuix sobre tres capes alhora: color, alçada (0..1) i rugositat (0..1). */
class Painter {
  readonly size: number;
  readonly color: CanvasRenderingContext2D;
  readonly height: CanvasRenderingContext2D;
  readonly rough: CanvasRenderingContext2D;
  readonly rand: () => number;

  constructor(size: number, seed: number) {
    this.size = size;
    const mk = (): CanvasRenderingContext2D => {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      return c.getContext("2d", { willReadFrequently: true })!;
    };
    this.color = mk();
    this.height = mk();
    this.rough = mk();
    this.rand = mulberry32(seed);
  }

  fill(color: string, height: number, rough: number): void {
    this.rect(0, 0, this.size, this.size, color, height, rough);
  }

  /** Rectangle que es repeteix a les vores (perquè la textura faci mosaic sense costures). */
  rect(x: number, y: number, w: number, h: number, color: string, height: number, rough: number): void {
    const s = this.size;
    for (const ox of [0, -s, s]) {
      for (const oy of [0, -s, s]) {
        if (x + ox + w < 0 || x + ox > s || y + oy + h < 0 || y + oy > s) continue;
        this.color.fillStyle = color;
        this.color.fillRect(x + ox, y + oy, w, h);
        this.height.fillStyle = gray(height);
        this.height.fillRect(x + ox, y + oy, w, h);
        this.rough.fillStyle = gray(rough);
        this.rough.fillRect(x + ox, y + oy, w, h);
      }
    }
  }

  /** Gra fi: soroll per píxel sobre el color i l'alçada. */
  grain(colorAmount: number, heightAmount: number): void {
    const s = this.size;
    const c = this.color.getImageData(0, 0, s, s);
    const h = this.height.getImageData(0, 0, s, s);
    for (let i = 0; i < c.data.length; i += 4) {
      const n = this.rand() - 0.5;
      for (let k = 0; k < 3; k++) c.data[i + k] = clamp255(c.data[i + k] * (1 + n * colorAmount));
      h.data[i] = h.data[i + 1] = h.data[i + 2] = clamp255(h.data[i] + n * 255 * heightAmount);
    }
    this.color.putImageData(c, 0, 0);
    this.height.putImageData(h, 0, 0);
  }

  /** Taques suaus (brutícia, variació de to). */
  blotches(count: number, radius: number, color: string, alpha: number): void {
    const s = this.size;
    for (let i = 0; i < count; i++) {
      const x = this.rand() * s;
      const y = this.rand() * s;
      const r = radius * (0.5 + this.rand());
      for (const ox of [0, -s, s]) {
        for (const oy of [0, -s, s]) {
          const g = this.color.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
          g.addColorStop(0, withAlpha(color, alpha));
          g.addColorStop(1, withAlpha(color, 0));
          this.color.fillStyle = g;
          this.color.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
        }
      }
    }
  }

  /** Varia un color base (hex) en lluminositat i to. */
  vary(hex: string, amount: number, hue = 0): string {
    const c = new THREE.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    c.setHSL(hsl.h + (this.rand() - 0.5) * hue, hsl.s, THREE.MathUtils.clamp(hsl.l * (1 + (this.rand() - 0.5) * amount), 0, 1));
    return `#${c.getHexString()}`;
  }
}

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);
const gray = (v: number): string => {
  const g = Math.round(clamp255(v * 255));
  return `rgb(${g},${g},${g})`;
};
const withAlpha = (hex: string, a: number): string => {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
};

/** Aparell de maons a trencajunts. `unit` = [llarg, alt] del maó en píxels, `joint` = gruix del junt. */
function bond(g: Painter, unit: [number, number], joint: number, base: string, mortar: string, variation: number, hue: number): void {
  g.fill(mortar, 0.25, 0.95);
  const [bw, bh] = unit;
  const rows = Math.round(g.size / (bh + joint));
  const cols = Math.round(g.size / (bw + joint));
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? (bw + joint) / 2 : 0;
    for (let c = 0; c < cols; c++) {
      const x = c * (bw + joint) + off + joint / 2;
      const y = r * (bh + joint) + joint / 2;
      g.rect(x, y, bw, bh, g.vary(base, variation, hue), 0.8 + g.rand() * 0.15, 0.7 + g.rand() * 0.2);
    }
  }
}

const RECIPES: Record<TextureName, Recipe> = {
  // Maó de façana de les files A–D: taronja-vermell, junt clar i prim. Maó català: 29 × 5 cm + junt de 1 cm.
  facadeBrick: {
    tile: [1.2, 1.2],
    size: 512,
    draw: (g) => {
      bond(g, [124, 21], 4, "#a8553a", "#b9ab98", 0.22, 0.03);
      g.blotches(14, 60, "#5a3a2a", 0.12);
      g.grain(0.12, 0.05);
    },
  },
  // Paviment dels passeigs: llambordes de maó vermell fosc a trencajunts (20 × 10 cm).
  paverBrick: {
    tile: [1.6, 1.6],
    size: 512,
    draw: (g) => {
      bond(g, [62, 30], 3, "#6e2f2a", "#4a3a33", 0.28, 0.02);
      g.blotches(20, 50, "#2a1e1a", 0.15);
      g.grain(0.14, 0.06);
    },
  },
  // Eix central i places: llambordes grises rectangulars (30 × 15 cm).
  concretePaver: {
    tile: [2.4, 2.4],
    size: 512,
    draw: (g) => {
      bond(g, [62, 30], 2, "#a19d95", "#6f6c67", 0.1, 0);
      g.blotches(16, 70, "#4d4a45", 0.12);
      g.grain(0.1, 0.05);
    },
  },
  // Formigó llis dels pilars, forjats i cornises: gris amb marques d'encofrat horitzontals.
  concrete: {
    tile: [2.4, 1.2],
    size: 512,
    draw: (g) => {
      g.fill("#9d9a94", 0.5, 0.85);
      for (let y = 0; y < g.size; y += 128) g.rect(0, y, g.size, 2, "#8a8781", 0.42, 0.9);
      g.blotches(30, 40, "#6d6a64", 0.12);
      g.blotches(20, 50, "#c2beb6", 0.1);
      g.grain(0.08, 0.04);
    },
  },
  // Arrebossat pintat (el color final el dona cada edifici): blanc trencat amb textura fina.
  plaster: {
    tile: [2, 2],
    size: 256,
    draw: (g) => {
      g.fill("#e8e5df", 0.5, 0.9);
      g.blotches(20, 30, "#cfcac2", 0.15);
      g.grain(0.06, 0.1);
    },
  },
  // Plaques de pedra beix (Biblioteca, renovació de B4): 1,2 × 0,6 m a junt obert.
  stone: {
    tile: [2.4, 1.2],
    size: 512,
    draw: (g) => {
      g.fill("#4a4640", 0.2, 0.9);
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) g.rect(c * 256 + 2, r * 256 + 2, 252, 252, g.vary("#d8cfbd", 0.06), 0.8, 0.75);
      }
      g.blotches(12, 60, "#b8ad98", 0.2);
      g.grain(0.06, 0.03);
    },
  },
};

/** Normal (espai tangent, OpenGL) a partir del mapa d'alçada amb diferències centrals i mosaic. */
function normalFromHeight(ctx: CanvasRenderingContext2D, size: number, strength: number): HTMLCanvasElement {
  const h = ctx.getImageData(0, 0, size, size).data;
  const out = document.createElement("canvas");
  out.width = out.height = size;
  const octx = out.getContext("2d")!;
  const img = octx.createImageData(size, size);
  const at = (x: number, y: number): number => h[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

const cache = new Map<TextureName, { color: HTMLCanvasElement; normal: HTMLCanvasElement; rough: HTMLCanvasElement }>();

function bake(name: TextureName): { color: HTMLCanvasElement; normal: HTMLCanvasElement; rough: HTMLCanvasElement } {
  const hit = cache.get(name);
  if (hit) return hit;
  const recipe = RECIPES[name];
  const g = new Painter(recipe.size, name.length * 7919 + name.charCodeAt(0));
  recipe.draw(g);
  const baked = { color: g.color.canvas, normal: normalFromHeight(g.height, recipe.size, 4), rough: g.rough.canvas };
  cache.set(name, baked);
  return baked;
}

/** Material procedural en mosaic. Les malles tenen UV en metres: la repetició té la mida real de la recepta. */
export function proceduralPbr(name: TextureName, anisotropy: number): PbrTextures {
  const baked = bake(name);
  const [tu, tv] = RECIPES[name].tile;
  const tex = (canvas: HTMLCanvasElement, color: boolean): THREE.Texture => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / tu, 1 / tv);
    t.anisotropy = anisotropy;
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: tex(baked.color, true), normalMap: tex(baked.normal, false), roughnessMap: tex(baked.rough, false) };
}
