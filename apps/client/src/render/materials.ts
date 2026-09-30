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
float facadeGlass;`,
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
}`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.15, facadeGlass);`,
      );
  };
  mat.customProgramCacheKey = () => "facade-v2";
  return mat;
}

export interface TerrainDetail {
  /** Formigó/pedra per a places i voreres. */
  concrete: { map: THREE.Texture; normalMap: THREE.Texture };
  /** Maó, reutilitzat com a paviment de maó dels passeigs. */
  brick: { map: THREE.Texture; normalMap: THREE.Texture };
}

/**
 * Terreny.
 * - `photo`: la textura és l'ortofoto. Ja porta la llum del sol i s'enfosqueix perquè no quedi il·luminada dues vegades.
 * - `detail`: de prop (< ~60 m) la foto se substitueix per materials en mosaic segons el color de cada punt de la foto
 *   (vermellós → paviment de maó, verd → gespa, la resta → formigó). Així el terra es veu nítid i sense les taques
 *   d'arbres i ombres de la foto; de lluny es continua veient la foto real.
 */
export function createTerrainMaterial(ground: THREE.Texture, photo = false, detail?: TerrainDetail): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ map: ground, roughness: 0.95, metalness: 0 });
  if (photo) mat.color.setScalar(0.62);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uConcreteMap = { value: detail?.concrete.map ?? null };
    shader.uniforms.uConcreteNormal = { value: detail?.concrete.normalMap ?? null };
    shader.uniforms.uBrickMap = { value: detail?.brick.map ?? null };
    shader.uniforms.uBrickNormal = { value: detail?.brick.normalMap ?? null };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTerrainPos;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvTerrainPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vTerrainPos;
uniform sampler2D uConcreteMap;
uniform sampler2D uConcreteNormal;
uniform sampler2D uBrickMap;
uniform sampler2D uBrickNormal;
float terrainNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  float a = fract(sin(dot(i, vec2(12.9898, 78.233))) * 43758.5453);
  float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(12.9898, 78.233))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453);
  float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float terrainNear;
vec3 terrainWeights; // x = maó, y = gespa, z = formigó
vec2 terrainConcreteUv;
vec2 terrainBrickUv;`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
{
  float n = terrainNoise(vTerrainPos.xz * 1.7) * 0.5 + terrainNoise(vTerrainPos.xz * 6.3) * 0.3 + terrainNoise(vTerrainPos.xz * 0.35) * 0.2;
  diffuseColor.rgb *= 0.92 + 0.16 * n;
  terrainNear = ${detail ? "1.0 - smoothstep(18.0, 65.0, length(vTerrainPos - cameraPosition))" : "0.0"};
  ${
    detail
      ? `vec3 o = sampledDiffuseColor.rgb;
  // Classificació amb la foto desenfocada (mip de ~3 m): ombres i copes d'arbre no trenquen les zones.
  vec3 oc = textureLod(map, vMapUv, 3.5).rgb;
  float sum = max(0.02, oc.r + oc.g + oc.b);
  float rr = oc.r / sum;
  float gg = oc.g / sum;
  // Transicions curtes, lleugerament trencades amb soroll perquè les vores no siguin taques rodones.
  float edge = (terrainNoise(vTerrainPos.xz * 3.1) - 0.5) * 0.02;
  float wGrass = smoothstep(0.385, 0.405, gg + edge);
  float wBrick = smoothstep(0.435, 0.455, rr + edge) * (1.0 - wGrass);
  float wConcrete = max(0.0, 1.0 - wGrass - wBrick);
  terrainWeights = vec3(wBrick, wGrass, wConcrete);
  terrainConcreteUv = vTerrainPos.xz / vec2(2.0, 1.0);
  terrainBrickUv = vTerrainPos.zx / 0.7; // paviment: maons més petits i girats
  vec3 concreteC = texture(uConcreteMap, terrainConcreteUv).rgb * vec3(0.6, 0.59, 0.56);
  vec3 brickC = texture(uBrickMap, terrainBrickUv).rgb * vec3(0.78, 0.62, 0.58);
  float g1 = terrainNoise(vTerrainPos.xz * 9.0);
  float g2 = terrainNoise(vTerrainPos.xz * 37.0);
  vec3 grassC = mix(vec3(0.045, 0.085, 0.02), vec3(0.09, 0.14, 0.035), g1) * (0.8 + 0.4 * g2);
  vec3 near = brickC * wBrick + grassC * wGrass + concreteC * wConcrete;
  // Conserva una part de la llum de la foto (zones d'ombra real), però sense les taques.
  float lo = dot(o, vec3(0.299, 0.587, 0.114));
  float ln = max(0.02, dot(near, vec3(0.299, 0.587, 0.114)));
  near *= mix(1.0, clamp(lo / ln, 0.55, 1.4), 0.35);
  diffuseColor.rgb = mix(diffuseColor.rgb, near, terrainNear);`
      : ""
  }
}`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
${
  detail
    ? `{
  // Relleu dels materials de prop: normal del mosaic (espai tangent ≈ x, z del món) passada a espai de vista.
  vec3 nc = texture(uConcreteNormal, terrainConcreteUv).xyz * 2.0 - 1.0;
  vec3 nb = texture(uBrickNormal, terrainBrickUv).xyz * 2.0 - 1.0;
  vec3 dn = nc * terrainWeights.z + nb.yxz * terrainWeights.x;
  vec3 bump = (viewMatrix * vec4(dn.x, 0.0, -dn.y, 0.0)).xyz;
  normal = normalize(normal + bump * 0.8 * terrainNear);
}`
    : ""
}`,
      );
  };
  mat.customProgramCacheKey = () => `terrain-v3-${detail ? "detail" : "plain"}`;
  return mat;
}
