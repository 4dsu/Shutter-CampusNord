import * as THREE from "three";

export interface PbrTextures {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

const loader = new THREE.TextureLoader();

/**
 * Textures PBR en mosaic de `assets/textures/<name>/` (CC0, ambientCG). `tileU`/`tileV` són els metres reals que
 * cobreix una repetició: les malles tenen UV en metres.
 */
export function loadPbr(name: string, tileU: number, tileV: number, anisotropy: number): PbrTextures {
  const load = (file: string, color: boolean): THREE.Texture => {
    const tex = loader.load(`/textures/${name}/${file}.jpg`);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1 / tileU, 1 / tileV);
    tex.anisotropy = anisotropy;
    if (color) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  return { map: load("color", true), normalMap: load("normal", false), roughnessMap: load("roughness", false) };
}
