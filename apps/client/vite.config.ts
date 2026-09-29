import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  // assets/ (mapa generat per l'importador) es serveix a l'arrel: /maps/campus-nord.json
  publicDir: fileURLToPath(new URL("../../assets", import.meta.url)),
  server: {
    port: 5173,
    proxy: {
      "/ws": { target: "ws://localhost:3000", ws: true },
    },
  },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    // Rapier porta el WASM incrustat en base64 (~3 MB): el paquet principal és gran a propòsit.
    chunkSizeWarningLimit: 6000,
  },
});
