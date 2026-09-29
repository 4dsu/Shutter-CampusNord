/**
 * Grups de col·lisió de Rapier: 16 bits de pertinença (part alta) i 16 bits de filtre (part baixa).
 * Els jugadors no xoquen entre ells: el controlador només mira el món estàtic.
 */
export const GROUP_WORLD = 1 << 0;
export const GROUP_PLAYER = 1 << 1;

export function interactionGroups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

/** Món estàtic: el veuen tant els jugadors com els raigs. */
export const WORLD_GROUPS = interactionGroups(GROUP_WORLD, 0xffff);
/** Col·lisionador del jugador: no interacciona amb res pel seu compte (el mou el controlador). */
export const PLAYER_GROUPS = interactionGroups(GROUP_PLAYER, 0);
/** Filtre per a consultes (moviment i trets) que només han de tocar el món. */
export const QUERY_WORLD_ONLY = interactionGroups(0xffff, GROUP_WORLD);
