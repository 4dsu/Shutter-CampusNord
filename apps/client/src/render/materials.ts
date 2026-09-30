import * as THREE from "three";

/**
 * Material de façana: el color ve del vèrtex i les finestres es dibuixen al shader a partir de
 * uv = (metres al llarg del perímetre, metres sobre la planta baixa) i l'atribut facade = (alçada de planta, alçada total, llavor).
 */
export function createFacadeMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec4 facade;
varying vec4 vFacade;
varying vec2 vFacadeUv;`,
      )
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
vFacade = facade;
vFacadeUv = uv;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec4 vFacade;
varying vec2 vFacadeUv;
float facadeHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float facadePulse(float x, float a, float b, float w) {
  return smoothstep(a - w, a + w, x) - smoothstep(b - w, b + w, x);
}
float facadeGlass;
float facadeShade = 0.0;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  float floorH = vFacade.x;
  float totalH = vFacade.y;
  float seed = vFacade.z;
  float style = vFacade.w;
  float u = vFacadeUv.x;
  float v = vFacadeUv.y;
  float gv = v / floorH;
  float wv = fwidth(gv);
  float fy = fract(gv);
  float level = floor(gv);
  float bay;
  float glass;
  float frame = 0.0;
  float glassAvg;
  float frameAvg = 0.0;
  if (style < 0.5) {
    // strips: finestres en franja; la planta baixa amb vidrieres més altes.
    bay = mix(2.6, 3.4, seed);
    float ground = step(level, 0.5);
    float top = mix(0.82, 0.9, ground);
    float bottom = mix(0.34, 0.12, ground);
    glass = facadePulse(fract(u / bay), 0.14, 0.86, fwidth(u / bay)) * facadePulse(fy, bottom, top, wv);
    glassAvg = 0.72 * (top - bottom);
    frame = facadePulse(fy, -0.02, 0.05, wv) * 0.5;
    frameAvg = 0.035;
  } else if (style < 1.5) {
    // campus: plafons de maó dins una graella de formigó i una finestra vertical amb lamel·les per crugia.
    bay = 3.6;
    float fx = fract(u / bay);
    float wu = fwidth(u / bay);
    frame = max(facadePulse(fy, -0.01, 0.13, wv), 1.0 - facadePulse(fx, 0.07, 0.93, wu));
    frameAvg = 0.25;
    glass = facadePulse(fx, 0.58, 0.84, wu) * facadePulse(fy, 0.2, 0.93, wv);
    glass *= 0.75 + 0.25 * step(0.5, fract(v * 3.0)); // lamel·les
    glassAvg = 0.17;
    frame = max(frame, step(totalH - 0.8, v));
    // Porxos a la planta baixa dels edificis alts (fila A): pilars de formigó i l'interior en ombra.
    float porch = step(level, 0.5) * step(0.0, v) * step(15.0, totalH);
    float pillar = 1.0 - facadePulse(fx, 0.14, 0.86, wu);
    frame = mix(frame, max(pillar, facadePulse(fy, 0.9, 1.01, wv)), porch);
    glass *= 1.0 - porch;
    facadeShade = porch * (1.0 - pillar) * facadePulse(fy, -0.1, 0.9, wv);
  } else if (style < 2.5) {
    // glass: franges de vidre amb muntants cada 1,6 m.
    bay = 1.6;
    glass = facadePulse(fy, 0.3, 0.97, wv) * facadePulse(fract(u / bay), 0.03, 0.97, fwidth(u / bay));
    glassAvg = 0.63;
  } else {
    // punched: finestres retallades.
    bay = mix(2.8, 3.4, seed);
    glass = facadePulse(fract(u / bay), 0.3, 0.7, fwidth(u / bay)) * facadePulse(fy, 0.3, 0.82, wv);
    glassAvg = 0.21;
  }
  // Lluny, el patró es fon amb el seu valor mitjà per evitar moiré.
  float fade = clamp(max(fwidth(u / bay), wv) * 1.6 - 0.3, 0.0, 1.0);
  float inside = step(0.0, v) * step(v, totalH - 0.8);
  facadeGlass = mix(glass, glassAvg, fade) * inside;
  frame = mix(frame, frameAvg, fade);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.53, 0.49), frame); // formigó (lineal)
  float tint = facadeHash(vec2(floor(u / bay), level) + seed * 17.0);
  vec3 glassColor = mix(vec3(0.023, 0.032, 0.045), vec3(0.048, 0.069, 0.09), tint); // vidre fosc (lineal)
  diffuseColor.rgb = mix(diffuseColor.rgb, glassColor, facadeGlass);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.03, 0.027), facadeShade * (1.0 - 0.5 * fade)); // ombra (lineal)
}`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.15, facadeGlass);`,
      );
  };
  mat.customProgramCacheKey = () => "facade-v3";
  return mat;
}

/**
 * Terrats i places sobre edificis: color del vèrtex amb un enllosat suau (uv = x, z en metres) perquè de prop,
 * caminant per sobre (p. ex. la Plaça de les Constel·lacions), no sigui una superfície llisa.
 */
export function createRoofMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vRoofUv;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvRoofUv = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vRoofUv;
float roofHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  vec2 g = vRoofUv / 1.5;
  vec2 w = fwidth(g);
  vec2 f = fract(g);
  float joint = max(1.0 - smoothstep(0.0, 0.04 + w.x, min(f.x, 1.0 - f.x)), 1.0 - smoothstep(0.0, 0.04 + w.y, min(f.y, 1.0 - f.y)));
  float fade = clamp(max(w.x, w.y) * 2.0 - 0.3, 0.0, 1.0);
  float slab = 0.94 + 0.08 * roofHash(floor(g));
  diffuseColor.rgb *= mix(slab * (1.0 - 0.18 * joint), 0.97, fade);
}`,
      );
  };
  mat.customProgramCacheKey = () => "roof-v1";
  return mat;
}

/** Terreny: textura del terra pintada + soroll de detall perquè de prop no es vegi borrós. */
export function createTerrainMaterial(ground: THREE.Texture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ map: ground, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTerrainPos;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvTerrainPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vTerrainPos;
float terrainNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  float a = fract(sin(dot(i, vec2(12.9898, 78.233))) * 43758.5453);
  float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(12.9898, 78.233))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453);
  float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
{
  float n = terrainNoise(vTerrainPos.xz * 1.7) * 0.5 + terrainNoise(vTerrainPos.xz * 6.3) * 0.3 + terrainNoise(vTerrainPos.xz * 0.35) * 0.2;
  diffuseColor.rgb *= 0.9 + 0.2 * n;
}`,
      );
  };
  mat.customProgramCacheKey = () => "terrain-v1";
  return mat;
}
