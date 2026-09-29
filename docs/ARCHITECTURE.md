# Arquitectura

## Visió general

```
                 ┌────────────────────── packages/shared ──────────────────────┐
                 │ map/ (tipus, terreny, geometria)   sim/ (jugador, armes)    │
                 │ physics/ (món Rapier)              protocol/ (missatges)    │
                 └───────────────┬───────────────────────────────┬─────────────┘
                                 │                               │
     tools/map-import ──JSON──▶ assets/maps/campus-nord.json     │
                                 │                               │
                  ┌──────────────▼─────────────┐   WebSocket  ┌───▼────────────────────┐
                  │ apps/client (navegador)    │◀────────────▶│ apps/server (Node)     │
                  │ Three.js · predicció · HUD │  binari /ws  │ sales · simulació 60Hz │
                  └────────────────────────────┘              └────────────────────────┘
```

El client i el servidor carreguen el **mateix mapa** i el converteixen amb les **mateixes funcions** de `shared/`:
el client en fa malles de Three.js i el servidor, col·lisions de Rapier.

## Mapa

### Pipeline d'importació (`tools/map-import`)

1. **OSM:** es descarrega `api.openstreetmap.org/api/0.6/map.json` per a la zona del campus i els voltants (a la cache).
   El límit jugable és l'anell exterior més gran de la relació 19836574 ("Campus Nord").
2. **Projecció:** lat/lon → UTM 31N (ETRS89), i després a coordenades locals: `x = E − E0`, `z = N0 − N`.
3. **Terreny:** WCS de l'ICGC (MET-5, format ArcGrid, EPSG:25831) → graella de 2 m amb interpolació bilineal.
   Alçades en cm (Uint16 en base64) relatives a `datum`.
4. **Edificis:**
   - Contorns i `building:part`. L'alçada surt de `height`, o de `building:levels` × l'alçada de planta del tipus d'edifici.
   - La planta baixa és a la cota de l'entrada principal (o la mediana del perímetre).
   - Les parets baixen fins a `footY`, per sota del punt més baix, perquè no quedin forats al pendent.
5. **Zones, camins, murs i objectes:**
   - Etiquetes OSM → tipus del joc (`AreaKind`, `PathKind`, `WallKind`, `PropKind`).
   - Els bancs sense direcció s'orienten cap al camí més proper.
6. **Correccions manuals** a `overrides.ts`: noms que falten, estils de façana, colors i quins edificis tenen interior.

### Geometria (`packages/shared/src/map/geometry.ts`)

- **Terreny:** un vèrtex per mostra. Cada cel·la es divideix per la diagonal (c, r) → (c+1, r+1); `TerrainField.heightAt` hi coincideix exactament.
- **Edificis:**
  - Una tira de parets per anell i terrat triangulat amb earcut (i sotabanc si `minHeight > 0`).
  - Atributs per vèrtex: `color` (sRGB) i `facade` = (alçada de planta, alçada total, llavor, estil).
  - `uv` = (metres al llarg del perímetre, metres sobre la planta baixa).
- **Murs:** una caixa per tram. Els murs de contenció cobreixen el desnivell entre els dos costats més una barana.

### Render (`apps/client/src/render`)

- **Terreny:** textura del terra pintada en un canvas a 0,25 m/píxel (zones, camins, ombra de contacte dels edificis) + soroll de detall al shader.
- **Façanes:** `MeshStandardMaterial` + `onBeforeCompile`. El patró de finestres de cada estil (`strips`, `campus`, `glass`, `punched`) es dibuixa amb antialiàsing (`fwidth`) i s'esvaeix de lluny per evitar moiré.
- **Objectes:** un `InstancedMesh` per tipus, amb geometries low-poly fusionades i color per vèrtex.
- **Cel i llum:** cel físic (addon `Sky`), entorn PMREM per als reflexos, sol direccional amb ombres que segueixen la càmera i boira.

## Simulació i física (fase 2)

- Rapier (`@dimforge/rapier3d-compat`) als dos costats. Col·lisions estàtiques:
  - Terreny, edificis i murs com a trimesh, a partir de la mateixa geometria del render.
  - Troncs, fanals i bancs com a formes simples.
- `stepPlayer(state, input, dt, world)` és determinista i es comparteix: el servidor l'executa de manera autoritativa i el client, per predir.
- `KinematicCharacterController` per al moviment (esglaons, pendents, lliscar per les parets).

## Xarxa (fase 3)

- **Ritmes:**
  - El servidor simula a 60 Hz i envia snapshots quantitzats a 30 Hz.
  - El client envia inputs per tick (tecles, yaw/pitch, número de seqüència) agrupats.
- **Predicció i reconciliació:**
  - El client aplica els seus inputs amb `stepPlayer`.
  - Quan arriba un snapshot, torna a l'estat del servidor corresponent a `lastAckedSeq` i hi torna a aplicar els inputs pendents.
- **Interpolació:** els altres jugadors es dibuixen a `t_servidor − 100 ms`.
- **Compensació de lag:** historial d'1 s de hitboxes (cap i cos). Els trets es rebobinen al moment que veia el tirador (com a màxim 200 ms).
- **Antitrampes bàsic:**
  - El client només envia inputs.
  - La cadència, la munició i la vida es controlen al servidor.
  - Hi ha un límit de missatges per client.
