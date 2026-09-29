import { Buttons, PLAYER, type PlayerInput, WEAPONS } from "@shutter/shared/sim";

/** Tecla (KeyboardEvent.code) → botó. No fem servir Ctrl: Ctrl+W tancaria la pestanya. */
const KEY_BUTTONS: Record<string, number> = {
  KeyW: Buttons.Forward,
  ArrowUp: Buttons.Forward,
  KeyS: Buttons.Back,
  ArrowDown: Buttons.Back,
  KeyA: Buttons.Left,
  ArrowLeft: Buttons.Left,
  KeyD: Buttons.Right,
  ArrowRight: Buttons.Right,
  Space: Buttons.Jump,
  KeyC: Buttons.Crouch,
  ShiftLeft: Buttons.Sprint,
  ShiftRight: Buttons.Sprint,
  KeyR: Buttons.Reload,
};

/** Botons que s'han de veure encara que es premin i deixin anar entre dos ticks. */
const LATCHED = Buttons.Fire | Buttons.Jump | Buttons.Reload;

/**
 * Llegeix teclat i ratolí i en fa inputs de simulació. La mirada (yaw/pitch) s'actualitza a cada moviment del ratolí
 * perquè la càmera respongui sense esperar el tick.
 */
export class InputManager {
  yaw = 0;
  pitch = 0;
  weapon = 1;
  sensitivity = 0.0022;
  /** Permet fer servir el teclat sense capturar el ratolí (proves automàtiques). */
  allowUnlocked = false;
  private held = 0;
  private latched = 0;
  private readonly element: HTMLElement;
  private lockListeners: ((locked: boolean) => void)[] = [];

  constructor(element: HTMLElement) {
    this.element = element;
    document.addEventListener("pointerlockchange", () => {
      const locked = this.locked;
      if (!locked) {
        this.held = 0;
        this.latched = 0;
      }
      for (const l of this.lockListeners) l(locked);
    });
    document.addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch = Math.max(-PLAYER.maxPitch, Math.min(PLAYER.maxPitch, this.pitch - e.movementY * this.sensitivity));
    });
    document.addEventListener("mousedown", (e) => {
      if ((!this.locked && !this.allowUnlocked) || e.button !== 0) return;
      this.press(Buttons.Fire);
    });
    document.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.held &= ~Buttons.Fire;
    });
    document.addEventListener(
      "wheel",
      (e) => {
        if (!this.locked) return;
        const n = WEAPONS.length;
        this.weapon = (this.weapon + (e.deltaY > 0 ? 1 : n - 1)) % n;
      },
      { passive: true },
    );
    window.addEventListener("keydown", (e) => {
      if (!this.locked && !this.allowUnlocked) return;
      if (e.code.startsWith("Digit")) {
        const slot = Number(e.code.slice(5)) - 1;
        if (slot >= 0 && slot < WEAPONS.length) this.weapon = slot;
      }
      const b = KEY_BUTTONS[e.code];
      if (b) {
        this.press(b);
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      const b = KEY_BUTTONS[e.code];
      if (b) this.held &= ~b;
    });
    window.addEventListener("blur", () => {
      this.held = 0;
    });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.element;
  }

  onLockChange(listener: (locked: boolean) => void): void {
    this.lockListeners.push(listener);
  }

  lock(): void {
    if (!this.locked) void this.element.requestPointerLock();
  }

  private press(button: number): void {
    this.held |= button;
    if (button & LATCHED) this.latched |= button;
  }

  /** Input del tick actual. Els botons "enganxats" es consumeixen. */
  sample(seq: number): PlayerInput {
    const buttons = this.held | this.latched;
    this.latched = 0;
    return { seq, buttons, yaw: this.yaw, pitch: this.pitch, weapon: this.weapon };
  }
}
