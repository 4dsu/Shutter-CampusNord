import * as THREE from "three";

export interface CharacterColors {
  shirt: string;
  pants: string;
  skin: string;
}

/** Estat que necessita el model per posar-se i animar-se (compatible amb PlayerState). */
export interface CharacterPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  vx: number;
  vz: number;
  onGround: boolean;
  crouchAmount: number;
}

const HIP = 0.88;
const SHOULDER = 1.44;

function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/**
 * Personatge low-poly de blocs (1,8 m, mirant cap a −z). Les mides coincideixen amb les hitboxes de la simulació.
 */
export class CharacterModel {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly legs: THREE.Group[] = [];
  private readonly arms: THREE.Group[] = [];
  private readonly head: THREE.Mesh;
  private readonly materials: THREE.MeshStandardMaterial[];
  private readonly armed: boolean;
  private walkPhase = 0;
  private flash = 0;
  private deathTime = -1;

  constructor(colors: CharacterColors, armed: boolean) {
    this.armed = armed;
    const mat = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true });
    const shirt = mat(colors.shirt);
    const pants = mat(colors.pants);
    const skin = mat(colors.skin);
    const dark = mat("#26292e");
    this.materials = [shirt, pants, skin, dark];

    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.12, HIP, 0);
      leg.add(box(0.2, 0.86, 0.22, pants, 0, -0.43, 0));
      leg.add(box(0.21, 0.1, 0.3, dark, 0, -0.81, -0.04)); // sabata
      this.legs.push(leg);
      this.body.add(leg);

      const arm = new THREE.Group();
      arm.position.set(side * 0.34, SHOULDER, 0);
      arm.add(box(0.14, 0.5, 0.16, shirt, 0, -0.25, 0));
      arm.add(box(0.12, 0.14, 0.14, skin, 0, -0.56, 0)); // mà
      if (armed && side === 1) arm.add(box(0.08, 0.5, 0.1, dark, -0.02, -0.72, 0)); // arma, al llarg del braç
      this.arms.push(arm);
      this.body.add(arm);
    }
    this.body.add(box(0.52, 0.6, 0.28, shirt, 0, HIP + 0.3, 0));
    this.head = box(0.3, 0.32, 0.3, skin, 0, 1.64, 0);
    this.head.add(box(0.2, 0.05, 0.02, dark, 0, 0.03, -0.155)); // ulls, a la cara (−z)
    this.body.add(this.head);
    this.root.add(this.body);
  }

  /** Posa el model on indica l'estat i n'avança l'animació. */
  update(p: CharacterPose, dt: number): void {
    this.root.position.set(p.x, p.y, p.z);
    this.root.rotation.y = p.yaw;

    if (this.deathTime >= 0) {
      this.deathTime += dt;
      const t = Math.min(1, this.deathTime / 0.35);
      this.body.rotation.x = (-Math.PI / 2) * t * t; // cau d'esquena
      this.body.position.y = 0.12 * t;
    } else {
      const speed = Math.hypot(p.vx, p.vz);
      this.walkPhase += speed * dt * 2.4;
      const swing = Math.sin(this.walkPhase) * 0.65 * Math.min(1, speed / 4);
      const crouch = p.crouchAmount;
      this.legs[0].rotation.x = p.onGround ? swing - crouch * 1.1 : 0.5;
      this.legs[1].rotation.x = p.onGround ? -swing + crouch * 0.2 : -0.3;
      this.body.position.y = -crouch * 0.5;
      this.head.rotation.x = p.pitch * 0.6;
      if (this.armed) {
        this.arms[0].rotation.x = Math.PI / 2 + p.pitch;
        this.arms[1].rotation.x = Math.PI / 2 + p.pitch;
        this.arms[0].rotation.z = -0.35;
      } else {
        this.arms[0].rotation.x = -swing * 0.8;
        this.arms[1].rotation.x = swing * 0.8;
      }
    }

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt);
      const k = this.flash / 0.12;
      for (const m of this.materials) m.emissive.setRGB(0.9 * k, 0.05 * k, 0.05 * k);
    }
  }

  hitFlash(): void {
    this.flash = 0.12;
  }

  die(): void {
    this.deathTime = 0;
  }

  revive(): void {
    this.deathTime = -1;
    this.body.rotation.x = 0;
    this.body.position.y = 0;
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }
}
