/** Botons de l'input (màscara de bits). */
export const Buttons = {
  Forward: 1 << 0,
  Back: 1 << 1,
  Left: 1 << 2,
  Right: 1 << 3,
  Jump: 1 << 4,
  Crouch: 1 << 5,
  Sprint: 1 << 6,
  Fire: 1 << 7,
  Reload: 1 << 8,
} as const;

/** Input d'un tick de simulació. Els angles són absoluts: el client els envia tal com els té la càmera. */
export interface PlayerInput {
  seq: number;
  buttons: number;
  yaw: number;
  pitch: number;
  /** Arma desitjada (índex de WEAPONS). */
  weapon: number;
}

export const emptyInput = (seq = 0): PlayerInput => ({ seq, buttons: 0, yaw: 0, pitch: 0, weapon: 0 });

export const pressed = (input: PlayerInput, button: number): boolean => (input.buttons & button) !== 0;
