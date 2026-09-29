import * as THREE from "three";
import { WEAPONS } from "@shutter/shared/sim";

const COLORS = {
  metal: "#474c54",
  polymer: "#3e4249",
  wood: "#7a5232",
  accent: "#8c7a5b",
  skin: "#d9a47e",
  sleeve: "#2f4f7f",
};

type Part = [w: number, h: number, d: number, x: number, y: number, z: number, color: keyof typeof COLORS, rotX?: number];

/** Peces de cada arma en coordenades de l'arma (endavant = −z, empunyadura a l'origen). */
const MODELS: Record<string, { parts: Part[]; muzzle: [number, number, number]; offset: [number, number, number]; kick: number }> = {
  pistol: {
    parts: [
      [0.045, 0.05, 0.19, 0, 0.03, -0.08, "metal"],
      [0.04, 0.03, 0.16, 0, 0, -0.07, "polymer"],
      [0.042, 0.11, 0.055, 0, -0.06, 0, "polymer", -0.2],
      [0.09, 0.1, 0.11, 0, -0.07, 0.02, "skin"],
      [0.1, 0.1, 0.25, 0, -0.1, 0.17, "sleeve"],
    ],
    muzzle: [0, 0.03, -0.19],
    offset: [0.2, -0.22, -0.46],
    kick: 0.09,
  },
  rifle: {
    parts: [
      [0.07, 0.1, 0.36, 0, 0.02, -0.12, "polymer"],
      [0.035, 0.035, 0.34, 0, 0.04, -0.46, "metal"],
      [0.065, 0.075, 0.22, 0, 0.02, -0.36, "accent"],
      [0.05, 0.17, 0.08, 0, -0.1, -0.16, "metal", 0.25],
      [0.045, 0.12, 0.06, 0, -0.08, 0.03, "polymer", -0.3],
      [0.06, 0.1, 0.22, 0, 0, 0.17, "polymer"],
      [0.02, 0.045, 0.06, 0, 0.09, -0.08, "metal"],
      [0.09, 0.1, 0.12, 0, -0.07, 0.03, "skin"],
      [0.08, 0.08, 0.1, 0, -0.03, -0.34, "skin"],
      [0.1, 0.1, 0.3, 0, -0.11, 0.2, "sleeve"],
    ],
    muzzle: [0, 0.04, -0.64],
    offset: [0.23, -0.24, -0.58],
    kick: 0.06,
  },
  shotgun: {
    parts: [
      [0.045, 0.045, 0.62, 0, 0.045, -0.34, "metal"],
      [0.04, 0.035, 0.5, 0, 0.005, -0.3, "metal"],
      [0.065, 0.065, 0.17, 0, 0.005, -0.37, "wood"],
      [0.06, 0.085, 0.22, 0, 0.02, -0.02, "metal"],
      [0.055, 0.1, 0.28, 0, -0.03, 0.2, "wood", 0.12],
      [0.09, 0.1, 0.12, 0, -0.06, 0.05, "skin"],
      [0.08, 0.08, 0.1, 0, -0.035, -0.37, "skin"],
      [0.1, 0.1, 0.3, 0, -0.11, 0.24, "sleeve"],
    ],
    muzzle: [0, 0.045, -0.66],
    offset: [0.24, -0.25, -0.6],
    kick: 0.16,
  },
};

export interface ViewModelState {
  weapon: number;
  /** Velocitat horitzontal (m/s). */
  speed: number;
  onGround: boolean;
  sprinting: boolean;
  /** 0..1 durant la recàrrega, −1 si no recarrega. */
  reload: number;
  /** 0..1 mentre es canvia d'arma. */
  switching: number;
}

/**
 * Arma en primera persona. Té escena i càmera pròpies i es dibuixa damunt del món (després de netejar la profunditat),
 * així no travessa les parets.
 */
export class ViewModel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  private readonly holder = new THREE.Group();
  private readonly weapons: THREE.Group[] = [];
  private readonly flashes: THREE.Mesh[] = [];
  private current = -1;
  private kick = 0;
  private bob = 0;
  private sprint = 0;
  private flashTime = 0;
  private swayX = 0;
  private swayY = 0;

  constructor() {
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const material = (c: keyof typeof COLORS) => {
      if (!materials.has(c)) materials.set(c, new THREE.MeshStandardMaterial({ color: COLORS[c], roughness: 0.6, metalness: c === "metal" ? 0.4 : 0, flatShading: true }));
      return materials.get(c)!;
    };
    const flashMaterial = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const spec of WEAPONS) {
      const def = MODELS[spec.id];
      const group = new THREE.Group();
      for (const [w, h, d, x, y, z, c, rx] of def.parts) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(c));
        mesh.position.set(x, y, z);
        if (rx) mesh.rotation.x = rx;
        group.add(mesh);
      }
      const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), flashMaterial);
      flash.position.set(...def.muzzle);
      flash.visible = false;
      const flash2 = flash.clone();
      flash2.rotation.y = Math.PI / 2;
      flash.add(flash2);
      group.add(flash);
      group.position.set(...def.offset);
      group.visible = false;
      this.flashes.push(flash);
      this.weapons.push(group);
      this.holder.add(group);
    }
    this.scene.add(this.holder);
    this.scene.add(new THREE.HemisphereLight(0xe4ecf7, 0x4d4538, 2.6));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.8);
    key.position.set(-1, 2, 1);
    this.scene.add(key);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  onShot(weapon: number): void {
    this.kick += MODELS[WEAPONS[weapon].id].kick;
    this.flashTime = 0.05;
    const flash = this.flashes[weapon];
    flash.rotation.z = Math.random() * Math.PI;
    flash.scale.setScalar(0.8 + Math.random() * 0.6);
  }

  /** Moviment del ratolí des de l'últim fotograma (per al balanceig). */
  addLook(dYaw: number, dPitch: number): void {
    this.swayX = THREE.MathUtils.clamp(this.swayX + dYaw * 0.3, -0.04, 0.04);
    this.swayY = THREE.MathUtils.clamp(this.swayY - dPitch * 0.3, -0.04, 0.04);
  }

  update(dt: number, s: ViewModelState): void {
    if (s.weapon !== this.current) {
      if (this.current >= 0) this.weapons[this.current].visible = false;
      this.weapons[s.weapon].visible = true;
      this.current = s.weapon;
    }
    const group = this.weapons[this.current];
    const base = MODELS[WEAPONS[this.current].id].offset;

    this.kick *= Math.exp(-dt * 16);
    this.swayX *= Math.exp(-dt * 8);
    this.swayY *= Math.exp(-dt * 8);
    const moving = s.onGround ? Math.min(1, s.speed / 4.6) : 0;
    this.bob += dt * (6 + s.speed * 1.4) * (moving > 0.05 ? 1 : 0);
    this.sprint += ((s.sprinting ? 1 : 0) - this.sprint) * Math.min(1, dt * 10);
    const reload = s.reload >= 0 ? Math.sin(s.reload * Math.PI) : 0;

    group.position.set(
      base[0] + Math.sin(this.bob) * 0.012 * moving + this.swayX - this.sprint * 0.04,
      base[1] - Math.abs(Math.cos(this.bob)) * 0.012 * moving + this.swayY - s.switching * 0.3 - reload * 0.1 - this.sprint * 0.03,
      base[2] + this.kick * 0.5,
    );
    group.rotation.set(this.kick * 1.6 - reload * 0.7 + this.sprint * -0.25, this.sprint * 0.55, reload * 0.4);

    this.flashTime = Math.max(0, this.flashTime - dt);
    this.flashes[this.current].visible = this.flashTime > 0;
  }
}
