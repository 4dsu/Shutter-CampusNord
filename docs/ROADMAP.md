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
- [x] Plaça de les Constel·lacions elevada: és el terrat del poliesportiu (semisoterrat, vidrieres cap al sud), amb lucernaris i rampa des del costat alt (`plaza.ts`)
- [x] Façanes segons fotografies: porxos a la planta baixa de la fila A, Omega de formigó blanc amb finestres en franja, Nexus I de xapa fosca, enllosat als terrats
- [ ] Millora pendent: barana a la vora de la plaça i l'escala de cargol de la cantonada oest
- [ ] Millora pendent: plaques solars als terrats de la fila A i lucernaris en dent de serra de la Biblioteca
- [ ] Millora pendent: murs de contenció amb desnivell sec (ara el terreny hi fa una rampa suau)
- [ ] Millora pendent: textura de terra més nítida de prop (textura de detall o decals de camí)

## Fase 2 — FPS en solitari 🚧

- [ ] Món de col·lisions Rapier compartit (`packages/shared/src/physics/`): terreny, edificis, murs i objectes (troncs, fanals, bancs)
- [ ] Simulació determinista del jugador (`packages/shared/src/sim/player.ts`): caminar, córrer, ajupir-se, saltar, esglaons ≤ 0,4 m, pendent ≤ 45°
- [ ] Control en primera persona al client (Pointer Lock, pas fix de 60 Hz, interpolació del render)
- [ ] Armes hitscan (pistola, fusell, escopeta): cadència, dispersió, retrocés, recàrrega, munició, dany al cap ×2
- [ ] Dianes/ninots per provar els trets
- [ ] HUD bàsic: punt de mira, vida, munició, arma, hit markers
- [ ] So amb WebAudio (trets, impactes, passes)
- [ ] Tests: determinisme de `stepPlayer`, col·lisions contra el mapa real, dany i cadència

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
- [ ] Allotjament (per decidir: VPS o Fly.io/Railway), HTTPS/WSS i enllaç públic

## Registre de decisions

| Data | Decisió |
| --- | --- |
| 2026-09-29 | Web (Three.js + TypeScript); estil low-poly procedural; modes FFA + equips FIB contra Telecos |
| 2026-09-29 | Mapa: exteriors de tot el campus + interiors clau (A5, A6, Biblioteca) |
| 2026-09-29 | Terreny de l'ICGC MET-5 (precisió de cm) en lloc de l'IGN (metres enters) |
| 2026-09-29 | Codi MIT, dades del mapa ODbL; treball amb branques + Pull Requests |
