import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";

export interface Environment {
  sun: THREE.DirectionalLight;
  /** Fa que l'ombra del sol segueixi la càmera. */
  update(focus: THREE.Vector3): void;
}

const SUN_ELEVATION = 38; // graus
const SUN_AZIMUTH = 215; // graus des del nord, en sentit horari (tarda, sud-oest)
const SHADOW_RADIUS = 110;

export function createEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene): Environment {
  const phi = THREE.MathUtils.degToRad(90 - SUN_ELEVATION);
  const theta = THREE.MathUtils.degToRad(SUN_AZIMUTH);
  // Nord = −z, est = +x.
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, Math.PI - theta);

  const sky = new Sky();
  sky.scale.setScalar(20000);
  const u = sky.material.uniforms;
  u.turbidity.value = 5;
  u.rayleigh.value = 1.3;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(sunDir);
  scene.add(sky);

  // Reflexos del cel (vidres, metall) a partir del mateix cel.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(1000);
  envSky.material.uniforms.sunPosition.value.copy(sunDir);
  envSky.material.uniforms.turbidity.value = 5;
  envSky.material.uniforms.rayleigh.value = 1.3;
  envScene.add(envSky);
  scene.environment = pmrem.fromScene(envScene).texture;
  scene.environmentIntensity = 0.45;
  pmrem.dispose();

  scene.fog = new THREE.Fog(0xc9d6e1, 220, 1500);

  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x6f6452, 0.45));

  const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = -SHADOW_RADIUS;
  cam.right = SHADOW_RADIUS;
  cam.top = SHADOW_RADIUS;
  cam.bottom = -SHADOW_RADIUS;
  cam.near = 1;
  cam.far = 800;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  const snapped = new THREE.Vector3();
  return {
    sun,
    update(focus) {
      // Ajusta el centre de l'ombra a passos de texel per evitar que les vores tremolin.
      const texel = (SHADOW_RADIUS * 2) / sun.shadow.mapSize.x;
      snapped.set(Math.round(focus.x / texel) * texel, focus.y, Math.round(focus.z / texel) * texel);
      sun.target.position.copy(snapped);
      sun.position.copy(snapped).addScaledVector(sunDir, 400);
    },
  };
}
