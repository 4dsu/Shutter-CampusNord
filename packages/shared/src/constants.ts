/** Simulació autoritativa del servidor (Hz). El client simula al mateix ritme. */
export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;

/** Cada quants ticks el servidor envia un snapshot (60 / 2 = 30 Hz). */
export const SNAPSHOT_EVERY_TICKS = 2;

/** Retard d'interpolació dels altres jugadors al client (s). */
export const INTERP_DELAY = 0.1;

export const MAX_PLAYERS_PER_ROOM = 16;

/** Ruta del WebSocket al servidor (mateix origen que el client en producció). */
export const WS_PATH = "/ws";
