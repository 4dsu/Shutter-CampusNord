# Llicència de les dades del mapa

Els fitxers d'aquesta carpeta (p. ex. `campus-nord.json`) són una **base de dades derivada** de:

- **OpenStreetMap** — © OpenStreetMap contributors. Disponible sota la
  [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
  <https://www.openstreetmap.org/copyright>
- **Model d'elevacions del terreny de 5 × 5 m (MET-5)** i **Ortofoto de Catalunya 25 cm (2025)**
  (`campus-nord-orto.jpg`) — © Institut Cartogràfic i Geològic de Catalunya (ICGC),
  sota [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). <https://www.icgc.cat>
- **Edificis del Cadastre (INSPIRE, parts d'edifici)** — © Dirección General del Catastro, amb reutilització lliure
  citant-ne la font. <https://www.catastro.hacienda.gob.es>

Per això aquestes dades es distribueixen sota la **ODbL 1.0**: les podeu fer servir, compartir i modificar sempre que
n'indiqueu l'origen (atribució a OpenStreetMap i a l'ICGC) i que qualsevol base de dades derivada que publiqueu
mantingui aquesta mateixa llicència.

El joc mostra aquestes atribucions a la pantalla de crèdits.

Les dades es regeneren amb `npm run map:import` (vegeu `tools/map-import/`). No editeu `campus-nord.json` a mà.
