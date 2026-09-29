import * as THREE from "three";

/** Càmera lliure per explorar el mapa: clic per capturar el ratolí, WASD, Espai/E amunt, Q/C avall, Maj. ràpid. */
export class FlyControls {
  yaw = 0;
  pitch = 0;
  speed = 18;
  private readonly keys = new Set<string>();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly element: HTMLElement;

  constructor(camera: THREE.PerspectiveCamera, element: HTMLElement) {
    this.camera = camera;
    this.element = element;
    element.addEventListener("click", () => {
      if (document.pointerLockElement !== element) void element.requestPointerLock();
    });
    document.addEventListener("mousemove", (e) => {
      if (document.pointerLockElement !== element) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0022, -1.55, 1.55);
    });
    window.addEventListener("keydown", (e) => this.keys.add(e.code));
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
  }

  lookAt(target: THREE.Vector3): void {
    const d = target.clone().sub(this.camera.position).normalize();
    this.yaw = Math.atan2(-d.x, -d.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    this.apply();
  }

  update(dt: number): void {
    const forward = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3();
    if (this.keys.has("KeyW")) move.add(forward);
    if (this.keys.has("KeyS")) move.sub(forward);
    if (this.keys.has("KeyD")) move.add(right);
    if (this.keys.has("KeyA")) move.sub(right);
    if (this.keys.has("Space") || this.keys.has("KeyE")) move.y += 1;
    if (this.keys.has("KeyQ") || this.keys.has("KeyC")) move.y -= 1;
    if (move.lengthSq() > 0) {
      const fast = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? 4 : 1;
      this.camera.position.addScaledVector(move.normalize(), this.speed * fast * dt);
    }
    this.apply();
  }

  private apply(): void {
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }
}
