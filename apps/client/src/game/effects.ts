import * as THREE from "three";
import type { SurfaceKind } from "@shutter/shared/physics";

const MAX_PARTICLES = 320;
const MAX_DECALS = 96;
const MAX_TRACERS = 24;
const TRACER_LIFE = 0.07;
const PARTICLE_LIFE = 0.45;

const SURFACE_COLORS: Record<SurfaceKind | "blood", string> = {
  terrain: "#8d7c63",
  building: "#b9b0a2",
  wall: "#a39c90",
  prop: "#6b5642",
  boundary: "#b9b0a2",
  blood: "#a3151b",
};

interface Particle {
  life: number;
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
}

/** Traçadores, espurnes d'impacte i forats de bala. */
export class Effects {
  readonly group = new THREE.Group();
  private readonly tracers: { mesh: THREE.Mesh; life: number }[] = [];
  private nextTracer = 0;
  private readonly particles: Particle[] = [];
  private readonly particleMesh: THREE.InstancedMesh;
  private nextParticle = 0;
  private readonly decals: THREE.InstancedMesh;
  private nextDecal = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly color = new THREE.Color();

  constructor() {
    this.group.name = "effects";
    // Traçadores: caixa unitària de z = 0 a z = 1, escalada entre dos punts.
    const tracerGeom = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
    for (let i = 0; i < MAX_TRACERS; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffe3a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const mesh = new THREE.Mesh(tracerGeom, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.tracers.push({ mesh, life: 0 });
      this.group.add(mesh);
    }

    this.particleMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial(), MAX_PARTICLES);
    this.particleMesh.frustumCulled = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({ life: 0, px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0 });
      this.particleMesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
      this.particleMesh.setColorAt(i, this.color.set(0xffffff));
    }
    this.group.add(this.particleMesh);

    const decalMat = new THREE.MeshBasicMaterial({
      color: 0x1d1b19,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.decals = new THREE.InstancedMesh(new THREE.CircleGeometry(0.06, 6), decalMat, MAX_DECALS);
    this.decals.frustumCulled = false;
    for (let i = 0; i < MAX_DECALS; i++) this.decals.setMatrixAt(i, this.m.makeScale(0, 0, 0));
    this.group.add(this.decals);
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const t = this.tracers[this.nextTracer];
    this.nextTracer = (this.nextTracer + 1) % MAX_TRACERS;
    const len = from.distanceTo(to);
    if (len < 0.5) return;
    t.mesh.position.copy(from);
    t.mesh.scale.set(0.018, 0.018, len);
    t.mesh.lookAt(to);
    t.mesh.visible = true;
    t.life = TRACER_LIFE;
  }

  /** Espurnes (i forat de bala si és una superfície del món). */
  impact(point: THREE.Vector3, normal: THREE.Vector3, surface: SurfaceKind | "blood", count = 7): void {
    this.color.set(SURFACE_COLORS[surface]);
    for (let i = 0; i < count; i++) {
      const idx = this.nextParticle;
      this.nextParticle = (this.nextParticle + 1) % MAX_PARTICLES;
      const p = this.particles[idx];
      p.life = PARTICLE_LIFE * (0.6 + Math.random() * 0.4);
      p.px = point.x;
      p.py = point.y;
      p.pz = point.z;
      const speed = 1.5 + Math.random() * 3;
      p.vx = (normal.x + (Math.random() - 0.5) * 1.2) * speed;
      p.vy = (normal.y + Math.random() * 0.8) * speed;
      p.vz = (normal.z + (Math.random() - 0.5) * 1.2) * speed;
      this.particleMesh.setColorAt(idx, this.color);
    }
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    if (surface === "blood") return;

    // Forat de bala orientat segons la normal.
    this.v.copy(point).addScaledVector(normal, 0.01);
    this.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    this.s.setScalar(0.7 + Math.random() * 0.5);
    this.decals.setMatrixAt(this.nextDecal, this.m.compose(this.v, this.q, this.s));
    this.decals.instanceMatrix.needsUpdate = true;
    this.nextDecal = (this.nextDecal + 1) % MAX_DECALS;
  }

  update(dt: number): void {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mesh.visible = t.life > 0;
      (t.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, t.life / TRACER_LIFE);
    }
    let any = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (p.life <= 0) continue;
      any = true;
      p.life -= dt;
      p.vy -= 12 * dt;
      p.px += p.vx * dt;
      p.py += p.vy * dt;
      p.pz += p.vz * dt;
      const scale = Math.max(0, p.life / PARTICLE_LIFE);
      this.particleMesh.setMatrixAt(i, this.m.compose(this.v.set(p.px, p.py, p.pz), this.q.identity(), this.s.setScalar(scale)));
    }
    if (any) this.particleMesh.instanceMatrix.needsUpdate = true;
  }
}
