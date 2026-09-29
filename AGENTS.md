# AGENTS.md — instruccions per als agents d'IA

Aquest fitxer és per a qualsevol agent (Claude Code, Codex, Cursor…) que treballi en aquest repositori.
Llegeix-lo sencer abans de tocar res. Els humans també el fan servir com a referència.

## 1. Què és el projecte

**Shutter Campus Nord**: shooter 3D multijugador que es juga des del navegador, ambientat al Campus Nord de la UPC
(Barcelona) i generat a partir de dades reals (OpenStreetMap + relleu de l'ICGC).

Decisions preses (no les canviïs sense parlar-ne en un issue):

- **Plataforma:** web, amb TypeScript a tot arreu. Client amb Vite + Three.js (WebGL2); servidor amb Node + `ws`.
- **Física:** Rapier (`@dimforge/rapier3d-compat`), la mateixa al client i al servidor.
- **Estil:** low-poly procedural, tot generat per codi. No s'hi afegeixen models ni textures externs.
- **Netcode:** servidor autoritatiu a 60 Hz, amb predicció i reconciliació al client, interpolació dels altres jugadors i compensació de lag per als trets.
- **Modes:** tots contra tots (FFA) i equips de facultats (**FIB contra Telecos/ETSETB**).
- **Mapa:** exteriors de tot el campus, més interiors clau (A5, A6, Biblioteca) a la fase 5.
- **Idioma:**
  - Català per a la interfície, els comentaris, la documentació i els missatges de commit.
  - Anglès per als identificadors del codi.

On som i què toca fer: [docs/ROADMAP.md](docs/ROADMAP.md). Disseny tècnic: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 2. Ordres

```bash
npm install            # Node >= 24
npm run dev            # servidor :3000 + client :5173 (proxy de /ws cap al servidor)
npm test               # Vitest (packages/**, apps/server/**, tools/**)
npm run typecheck      # tsc a cada paquet
npm run build          # build del client
npm run map:import     # regenera assets/maps/campus-nord.json (fa servir la cache de tools/map-import/.cache)
```

Abans de cada push, **`npm run typecheck` i `npm test` han de passar**. La CI ho torna a comprovar a cada PR.

## 3. Mapa del codi

| Ruta | Contingut |
| --- | --- |
| `packages/shared/src/map/` | Tipus del mapa (`types.ts`), geometria 2D (`geo.ts`), terreny (`terrain.ts`), malles compartides (`geometry.ts`) |
| `packages/shared/src/sim/` | Simulació determinista del jugador i les armes (fase 2) |
| `packages/shared/src/physics/` | Construcció del món Rapier a partir del mapa (fase 2) |
| `packages/shared/src/protocol/` | Missatges binaris client↔servidor (fase 3) |
| `apps/client/src/render/` | Escena Three.js: terreny, façanes, objectes, rètols, cel, personatges |
| `apps/client/src/game/` | Joc en primera persona: bucle de 60 Hz, input, arma en primera persona, efectes, dianes |
| `apps/client/src/ui/`, `apps/client/src/audio/` | HUD (DOM) i sons sintetitzats (WebAudio) |
| `apps/client/src/viewer.ts`, `apps/client/src/debug/` | Visor del mapa amb càmera lliure (`?mode=viewer`) |
| `apps/server/src/` | Servidor HTTP + WebSocket (`index.ts`), fitxers estàtics (`static.ts`) |
| `tools/map-import/src/` | Importador: `osm.ts`, `dem.ts`, `build.ts`, `overrides.ts`, `projection.ts` |
| `assets/maps/campus-nord.json` | Mapa generat. **No l'editis a mà**: canvia l'importador o `overrides.ts` i torna a executar-lo |

## 4. Convencions obligatòries

### TypeScript i mòduls

- **ESM i TypeScript estricte.** El servidor i les eines s'executen amb el **TypeScript natiu de Node**, sense compilar. Per tant:
  - Les importacions relatives porten l'extensió **`.ts`**: `import { x } from "./foo.ts"`.
  - Només sintaxi esborrable (`erasableSyntaxOnly`): res d'`enum`, `namespace`, *parameter properties* ni `import x = require()`.
    Fes servir objectes `as const` i unions de literals.
  - Els tipus s'importen amb `import type` (`verbatimModuleSyntax`).
- **`packages/shared` ha de funcionar igual al navegador i a Node:**
  - No hi facis servir el DOM ni APIs de Node.
  - La simulació ha de ser determinista: res de `Math.random()` ni de `Date.now()` a `sim/`.
  - Els paquets s'importen per subruta: `@shutter/shared/map`, `@shutter/shared/sim`, `@shutter/shared/protocol`, `@shutter/shared/physics`, `@shutter/shared/constants`.

### Sistema de coordenades i unitats

- Metres, segons i radians.
- **x = est, y = amunt, z = sud** (el nord és −z).
- L'origen és el centre del campus. Les alçades són relatives a `map.datum` (m sobre el nivell del mar).
- Punt en planta: `Vec2 = [x, z]`.
- Anells de polígon: l'exterior té àrea amb signe **positiva** (`geo.signedArea`) i els forats, negativa.
- Terreny: cada cel·la es divideix per la diagonal (col, row) → (col+1, row+1). `TerrainField.heightAt()` interpola sobre aquests mateixos triangles.

### Geometria compartida

- **El que es veu i el que col·lisiona surten de les mateixes funcions** (`buildTerrainMesh`, `buildBuildingsMesh`, `buildWallsMesh`).
  No facis una col·lisió "a part" que pugui divergir del render.
- Totes les cares miren cap a fora (ordre antihorari vist des de fora). Hi ha tests que ho comproven: afegeix-n'hi si crees geometria nova.

### Render (client)

- Els colors per vèrtex de les dades són **sRGB**. `toBufferGeometry` (`render/meshes.ts`) els passa a lineal.
  Les constants de color dins dels shaders van en lineal.
- Els materials amb efectes propis fan servir `onBeforeCompile` i un `customProgramCacheKey` únic.
- No facis servir `innerHTML` amb dades (els noms venen d'OSM): construeix el DOM amb `textContent`.

### Estil del codi

- Imita el codi del voltant: comentaris breus en català que expliquen el *perquè*, funcions petites i sense abstraccions prematures.
- Cap dependència nova sense motiu clar. Si n'afegeixes una, explica al PR per què.

### Proves al navegador

- **`?mode=viewer`:** visor del mapa amb càmera lliure. Amb `&cam=x,y,z,yaw,pitch` es posa la càmera en un punt concret.
- **`?nolock=1`:** el joc accepta teclat i clics sense capturar el ratolí. Així un agent pot enviar esdeveniments amb JavaScript.
- **Depuració (només en desenvolupament):** `window.__shutter` exposa `state`, `weapons`, `input` (yaw/pitch/arma), `physics` i `dummies` (`list()`).
  Exemple: apunta amb `input.yaw`/`input.pitch` i dispara amb `document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }))`.

## 5. Flux de treball (branques + Pull Requests)

Hi treballen diverses persones, cadascuna amb el seu agent. Per no barrejar feina:

1. **Abans de començar:**
   - `git fetch && git switch main && git pull`.
   - Mira els PR i els issues oberts (`gh pr list`, `gh issue list`) per no fer una tasca que ja fa algú altre.
2. **Una branca per tasca, creada des de `main`:**
   - Noms: `fase-2/controlador-fps`, `fix/rètols`, `docs/…`, `map/…`.
   - Mai no treballis directament a `main`.
3. **Commits:**
   - Petits i en català, amb el verb en imperatiu: `Afegeix el controlador FPS amb Rapier`.
   - Fes push sovint (`git push -u origin <branca>`) perquè els altres vegin el progrés.
4. **Pull Request:**
   - Obre'l aviat, com a *draft* si encara no està acabat, i omple la plantilla.
   - Abans de marcar-lo com a llest: `git fetch && git rebase origin/main`, i `npm run typecheck && npm test`.
5. **Documentació:** actualitza [docs/ROADMAP.md](docs/ROADMAP.md) al mateix PR (marca tasques fetes o afegeix-ne) i, si canvia el disseny, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
6. **Fusió:** es fusiona a `main` amb *squash*, quan la CI passa. No facis `push --force` a `main` ni a branques d'altres.
7. **Conflictes:** si toques fitxers que un altre PR obert també toca, avisa-ho al PR i coordineu-vos.
   Els fitxers "calents" són `packages/shared/src/map/types.ts`, `apps/client/src/main.ts` i `assets/maps/campus-nord.json`.

### Definició de "fet"

- `npm run typecheck` i `npm test` passen.
- La lògica nova (sobretot a `shared/` i al servidor) té tests.
- Els canvis visuals s'han revisat al navegador, amb captura al PR quan calgui.
- El ROADMAP està actualitzat.

## 6. Coses que cal saber (errors habituals)

- **Terreny de l'ICGC:** el servidor WCS afegeix un "5" al nom de la cobertura. Per això es demana `COVERAGE=icc:met`, que acaba sent `met5`.
  L'importador ja ho gestiona; no ho "arreglis".
- **API d'OSM:**
  - Respecta la política d'ús: l'importador guarda les descàrregues a `tools/map-import/.cache/` (ignorada per git).
  - Fes servir `--refresh` només quan calgui.
- **Edificis sense nom a OSM:** A4, A5, A6, B3 i B6 no tenen nom i s'identifiquen per id de via a `tools/map-import/src/overrides.ts`.
- **Parts d'edificis:** un edifici amb `building:part` es divideix en volums (`A5-p0`, `A5-p1`…). L'interior i el rètol van a la part més gran.
- **Dades ODbL:** qualsevol canvi a `assets/maps/` ha de mantenir l'atribució (`map.attribution`, `assets/maps/LICENSE.md`).
- **Node:** el servidor s'executa amb `node --watch src/index.ts`, no amb `tsx`. Si Node es queixa de sintaxi, segurament has fet servir sintaxi no esborrable.
