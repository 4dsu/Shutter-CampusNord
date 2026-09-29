import RAPIER from "@dimforge/rapier3d-compat";

let ready: Promise<typeof RAPIER> | undefined;

/** Inicialitza Rapier (WASM) una sola vegada; serveix igual al navegador i a Node. */
export function loadRapier(): Promise<typeof RAPIER> {
  ready ??= RAPIER.init().then(() => RAPIER);
  return ready;
}

export type Rapier = typeof RAPIER;
export { RAPIER };
