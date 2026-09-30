# Full de ruta

Estat de cada fase i tasques pendents. **Actualitzeu aquest fitxer al mateix PR que fa la feina**: marqueu les tasques
fetes amb `[x]` i afegiu-ne de noves si en sorgeixen. Si agafeu una tasca gran, obriu un issue i assigneu-vos-el perquè
ningú més la comenci.

Llegenda: ✅ fet · 🚧 en curs · ⏳ pendent

## Fase 0 — Esquelet ✅

- [x] Monorepo amb npm workspaces (`packages/shared`, `apps/client`, `apps/server`, `tools/map-import`)
- [x] TypeScript estricte (TS 7) i TypeScript natiu de Node al servidor i a les eines
- [x] Client Vite + Three.js, servidor HTTP + WebSocket (`/ws`), proxy de desenvolupament
- [x] Vitest i scripts `dev`, `build`, `test`, `typecheck`

## Fase 1 — Mapa exterior ✅

- [x] Importador OSM (API 0.6) + terreny ICGC MET-5 (WCS) → `assets/maps/campus-nord.json`
- [x] Edificis amb parts, entrades, zones, camins, murs i objectes; noms que falten via `overrides.ts`
- [x] Geometria compartida (terreny, edificis, murs) amb tests d'orientació de cares
- [x] Visor 3D: façanes procedurals (maó i formigó de les files A–D, vidre, finestres retallades), rètols, cel, ombres, objectes instanciats
- [x] Tests del mapa generat (A1–D6 presents, polígons vàlids, alçades reals)
- [ ] Millora pendent: murs de contenció amb desnivell sec (ara el terreny hi fa una rampa suau)
- [ ] Millora pendent: textura de terra més nítida de prop (textura de detall o decals de camí)

## Fase 1b — Campus fidel i amb textures reals 🚧 (PR #2, branca `fase-1b/fidelitat`)

- [x] Ortofoto de l'ICGC 25 cm (2025) com a terra i textura dels terrats
- [x] Edificis del campus amb les parts del Cadastre (contorns oficials, plantes reals); soterranis eliminats (Poliesportiu); informe OSM → Cadastre
- [x] Editor `?mode=editor`: ortofoto + edificis del joc + Cadastre per comparar
- [x] Kit de façana A–D amb relleu real (formigó, maó enfonsat, finestres amb lamel·les) i textures PBR CC0
- [ ] Fila A, B2–B5 i B0 (el Cadastre no les té): corregir contorns amb l'editor
- [x] Editor: moure vèrtexs, propietats (plantes, alçada, porxo, façana), copiar contorns del Cadastre, edificis nous i places planes → `tools/map-import/corrections.json` + regeneració automàtica
- [ ] Editor: escales i murs de contenció
- [ ] Kits per als altres estils (mur cortina de vidre per a Omega/BSC, finestres retallades amb relleu)
- [ ] Edificis singulars a partir de fotos (`docs/FOTOS.md`)
- [ ] Terrasses i murs de contenció amb desnivell sec; escales amb graons
- [ ] Render: ombres en cascada, SSAO, arbres segons espècie, opció de qualitat baixa
- [ ] Alçades amb el model de superfícies (LiDAR) de l'ICGC, si és accessible

## Fase 2 — FPS en solitari 🚧 (PR #1, branca `fase-2/fps-en-solitari`)

- [x] Món de col·lisions Rapier compartit (`packages/shared/src/physics/`): terreny, edificis, murs, límit jugable i objectes (troncs, fanals, bancs…)
- [x] Simulació determinista del jugador (`packages/shared/src/sim/player.ts`): caminar, córrer, ajupir-se, saltar, esglaons ≤ 0,42 m, pendent ≤ 46°
- [x] Control en primera persona al client (Pointer Lock, pas fix de 60 Hz, càmera interpolada entre ticks)
- [x] Armes hitscan (pistola, fusell, escopeta): cadència, dispersió determinista, retrocés amb recuperació, recàrrega, munició, dany al cap ×2 i caiguda per distància
- [x] Dianes d'entrenament (fixes i mòbils) amb reaparició, col·locades on es veuen des del punt d'inici
- [x] Arma en primera persona, traçadores, espurnes, forats de bala i flaix del canó
- [x] HUD: punt de mira dinàmic, hit markers (cos/cap/baixa), vida, munició, marcador i pantalla d'inici/pausa
- [x] So sintetitzat amb WebAudio (trets per arma, impactes, passes, recàrrega)
- [x] Tests: determinisme de `stepPlayer`, col·lisions contra el mapa real, salt, cadència, recàrrega i impactes
- [ ] Revisió de sensacions de joc amb persones (sensibilitat, velocitats, retrocés) → ajustar `PLAYER` i `WEAPONS`
- [ ] Opcions bàsiques (sensibilitat, FOV, volum) — es pot deixar per a la fase 4

## Fase 3 — Multijugador ⏳

- [ ] Protocol binari (`packages/shared/src/protocol/`) amb tests d'anada i tornada
- [ ] Sales (fins a 16 jugadors, codi de 4 lletres, `?sala=ABCD`, partida ràpida)
- [ ] Bucle autoritatiu a 60 Hz; snapshots quantitzats a 30 Hz
- [ ] Predicció + reconciliació al client; interpolació dels altres jugadors a t − 100 ms
- [ ] Compensació de lag (historial d'1 s de hitboxes, rebobinat de màx. 200 ms)
- [ ] Mort, reaparició al spawn més segur, marcador, kill feed
- [ ] Bots al servidor que es mouen pel graf de camins d'OSM
- [ ] Test d'integració sense navegador: servidor + 8–16 bots durant 60 s

## Fase 4 — Joc complet ⏳

- [ ] Menú: nick, partida ràpida, crear sala, unir-se amb codi, opcions (sensibilitat, FOV, volum, qualitat), crèdits
- [ ] Modes: tots contra tots (25 baixes / 10 min) i equips FIB contra Telecos (spawns per zona)
- [ ] Minimapa real, indicador de dany, pantalla final
- [ ] Personatges low-poly amb animació procedural i color d'equip

## Fase 5 — Interiors ⏳

- [ ] Sistema d'interiors com a dades tipades (parets amb obertures, forjats, escales, objectes)
- [ ] A5 i A6 (planta baixa, primera planta, accés al terrat) i Biblioteca (planta baixa)

## Fase 6 — Desplegament ⏳

- [ ] Dockerfile i build de producció
- [ ] Compressió (gzip/brotli) dels fitxers estàtics: ara el JS fa 4,9 MB (1,8 MB comprimit) i el mapa 732 KB (292 KB)
- [ ] Opcional: `@dimforge/rapier3d` amb el `.wasm` a part en lloc de la versió `-compat` (base64), per carregar menys
- [ ] Allotjament (per decidir: VPS o Fly.io/Railway), HTTPS/WSS i enllaç públic

## Registre de decisions

| Data | Decisió |
| --- | --- |
| 2026-09-29 | Web (Three.js + TypeScript); estil low-poly procedural; modes FFA + equips FIB contra Telecos |
| 2026-09-29 | Mapa: exteriors de tot el campus + interiors clau (A5, A6, Biblioteca) |
| 2026-09-29 | Terreny de l'ICGC MET-5 (precisió de cm) en lloc de l'IGN (metres enters) |
| 2026-09-29 | Codi MIT, dades del mapa ODbL; treball amb branques + Pull Requests |
