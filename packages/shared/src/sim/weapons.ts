import { type Vec3, clamp, normalize3, viewDirection } from "../math.ts";
import { Buttons, type PlayerInput, pressed } from "./input.ts";
import { PLAYER, type PlayerState, eyeHeight } from "./player.ts";
import { hashSeed, mulberry32 } from "./random.ts";

export type WeaponId = "pistol" | "rifle" | "shotgun";

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  /** Dany per bala (o per perdigó). */
  damage: number;
  headshotMultiplier: number;
  pellets: number;
  /** Segons entre trets. */
  fireInterval: number;
  automatic: boolean;
  magazine: number;
  /** Munició de reserva inicial. */
  reserve: number;
  reloadTime: number;
  /** Semiangle del con de dispersió (radians) quiet, i extra en moviment i a l'aire. */
  spread: number;
  moveSpread: number;
  airSpread: number;
  range: number;
  /** Entre falloffStart i falloffEnd el dany baixa linealment fins a damage × minDamageFactor. */
  falloffStart: number;
  falloffEnd: number;
  minDamageFactor: number;
  /** Pujada de la mira per tret (radians); l'aplica el client a la càmera. */
  recoil: number;
}

export const WEAPONS: readonly WeaponSpec[] = [
  {
    id: "pistol",
    name: "Pistola",
    damage: 28,
    headshotMultiplier: 2,
    pellets: 1,
    fireInterval: 0.16,
    automatic: false,
    magazine: 12,
    reserve: 48,
    reloadTime: 1.2,
    spread: 0.006,
    moveSpread: 0.025,
    airSpread: 0.06,
    range: 150,
    falloffStart: 25,
    falloffEnd: 60,
    minDamageFactor: 0.6,
    recoil: 0.025,
  },
  {
    id: "rifle",
    name: "Fusell",
    damage: 24,
    headshotMultiplier: 2,
    pellets: 1,
    fireInterval: 0.095,
    automatic: true,
    magazine: 30,
    reserve: 90,
    reloadTime: 2.0,
    spread: 0.009,
    moveSpread: 0.04,
    airSpread: 0.08,
    range: 250,
    falloffStart: 40,
    falloffEnd: 100,
    minDamageFactor: 0.7,
    recoil: 0.018,
  },
  {
    id: "shotgun",
    name: "Escopeta",
    damage: 11,
    headshotMultiplier: 1.5,
    pellets: 9,
    fireInterval: 0.8,
    automatic: false,
    magazine: 6,
    reserve: 24,
    reloadTime: 2.3,
    spread: 0.075,
    moveSpread: 0.02,
    airSpread: 0.03,
    range: 45,
    falloffStart: 8,
    falloffEnd: 25,
    minDamageFactor: 0.3,
    recoil: 0.07,
  },
];

export const SWITCH_TIME = 0.3;

export interface WeaponState {
  current: number;
  /** Bales al carregador i de reserva, per arma. */
  ammo: number[];
  reserve: number[];
  /** Segons que falten per poder tornar a disparar (pot ser lleugerament negatiu per mantenir la cadència). */
  cooldown: number;
  /** Segons que falten de recàrrega (0 = no recarrega). */
  reload: number;
  /** Segons que falten per acabar de canviar d'arma. */
  switching: number;
  triggerHeld: boolean;
  /** Comptador de trets: llavor de la dispersió. */
  shots: number;
}

export function createWeaponState(current = 1): WeaponState {
  return {
    current,
    ammo: WEAPONS.map((w) => w.magazine),
    reserve: WEAPONS.map((w) => w.reserve),
    cooldown: 0,
    reload: 0,
    switching: 0,
    triggerHeld: false,
    shots: 0,
  };
}

export function cloneWeaponState(w: WeaponState): WeaponState {
  return { ...w, ammo: w.ammo.slice(), reserve: w.reserve.slice() };
}

export type WeaponEvent =
  | { type: "shot"; weapon: number; shot: number; origin: Vec3; directions: Vec3[] }
  | { type: "dry"; weapon: number }
  | { type: "reloadStart"; weapon: number }
  | { type: "reloadEnd"; weapon: number }
  | { type: "switch"; weapon: number };

/** Dispersió actual (radians) segons el moviment del jugador. */
export function currentSpread(spec: WeaponSpec, s: PlayerState): number {
  const move = clamp(Math.hypot(s.vx, s.vz) / PLAYER.walkSpeed, 0, 1.5);
  let spread = spec.spread + spec.moveSpread * move + (s.onGround ? 0 : spec.airSpread);
  if (s.crouching && s.onGround) spread *= 0.65;
  return spread;
}

/** Direccions de les bales d'un tret: deterministes a partir de la llavor del jugador i el número de tret. */
export function shotDirections(spec: WeaponSpec, s: PlayerState, seed: number, shot: number): Vec3[] {
  const forward = viewDirection(s.yaw, s.pitch);
  const right = { x: Math.cos(s.yaw), y: 0, z: -Math.sin(s.yaw) };
  // up = right × forward
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };
  const spread = currentSpread(spec, s);
  const rand = mulberry32(hashSeed(seed, shot));
  const dirs: Vec3[] = [];
  for (let i = 0; i < spec.pellets; i++) {
    // Punt uniforme dins d'un disc de radi = dispersió.
    const r = spread * Math.sqrt(rand());
    const a = rand() * Math.PI * 2;
    const ox = r * Math.cos(a);
    const oy = r * Math.sin(a);
    dirs.push(
      normalize3({
        x: forward.x + right.x * ox + up.x * oy,
        y: forward.y + right.y * ox + up.y * oy,
        z: forward.z + right.z * ox + up.z * oy,
      }),
    );
  }
  return dirs;
}

/** Posició dels ulls: origen dels trets. */
export function eyePosition(s: PlayerState): Vec3 {
  return { x: s.x, y: s.y + eyeHeight(s), z: s.z };
}

function startReload(w: WeaponState, events: WeaponEvent[]): void {
  const spec = WEAPONS[w.current];
  if (w.reload > 0 || w.ammo[w.current] >= spec.magazine || w.reserve[w.current] <= 0) return;
  w.reload = spec.reloadTime;
  events.push({ type: "reloadStart", weapon: w.current });
}

/**
 * Avança l'estat de les armes un pas (modifica `w`). `seed` identifica el jugador perquè la dispersió
 * sigui reproduïble al client (predicció) i al servidor (autoritat).
 */
export function stepWeapons(w: WeaponState, s: PlayerState, input: PlayerInput, dt: number, seed: number): WeaponEvent[] {
  const events: WeaponEvent[] = [];
  w.cooldown -= dt;

  // Canvi d'arma: cancel·la la recàrrega.
  if (input.weapon !== w.current && input.weapon >= 0 && input.weapon < WEAPONS.length) {
    w.current = input.weapon;
    w.switching = SWITCH_TIME;
    w.reload = 0;
    events.push({ type: "switch", weapon: w.current });
  }
  if (w.switching > 0) w.switching = Math.max(0, w.switching - dt);

  const spec = WEAPONS[w.current];
  if (w.reload > 0) {
    w.reload -= dt;
    if (w.reload <= 0) {
      const take = Math.min(spec.magazine - w.ammo[w.current], w.reserve[w.current]);
      w.ammo[w.current] += take;
      w.reserve[w.current] -= take;
      w.reload = 0;
      events.push({ type: "reloadEnd", weapon: w.current });
    }
  }
  if (pressed(input, Buttons.Reload) && w.switching === 0) startReload(w, events);

  const fireDown = pressed(input, Buttons.Fire);
  const newPress = fireDown && !w.triggerHeld;
  const trigger = spec.automatic ? fireDown : newPress;
  let fired = false;
  if (trigger && w.reload === 0 && w.switching === 0 && w.cooldown <= 0) {
    if (w.ammo[w.current] > 0) {
      w.ammo[w.current] -= 1;
      w.cooldown += spec.fireInterval;
      w.shots += 1;
      fired = true;
      events.push({
        type: "shot",
        weapon: w.current,
        shot: w.shots,
        origin: eyePosition(s),
        directions: shotDirections(spec, s, seed, w.shots),
      });
      if (w.ammo[w.current] === 0) startReload(w, events);
    } else if (newPress) {
      events.push({ type: "dry", weapon: w.current });
      startReload(w, events);
    }
  }
  // Sense disparar no s'acumula "crèdit" de trets.
  if (!fired && w.cooldown < 0) w.cooldown = 0;
  w.triggerHeld = fireDown;
  return events;
}
