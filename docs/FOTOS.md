# Fotos del campus que necessitem

Amb aquestes fotos es modelen els edificis singulars i s'ajusten els colors, les finestres i els detalls perquè el
joc s'assembli al Campus Nord real. Les dades públiques (ortofoto, Cadastre, OSM) només donen la vista des de dalt.

## Com fer-les

- **De dia i amb llum difusa**, si pot ser (núvol prim o a primera/última hora), sense ombres fortes a la façana.
- **Frontals**: plantat davant de la façana, amb el mòbil vertical respecte al terra (sense inclinar-lo amunt).
  Si l'edifici no hi cap, feu-ne dues o tres fotos solapades d'esquerra a dreta.
- **Una de conjunt i una de detall** per façana: la de detall a 3–5 m, perquè es vegin el material, les finestres i els marcs.
- Deixeu la **ubicació GPS activada** al mòbil: ajuda a saber des d'on s'ha fet cada foto.
- **Noms**: `<edifici>-<orientació>-<número>.jpg`, per exemple `A5-sud-1.jpg`, `omega-nord-2.jpg` o `placa-poliesportiu-1.jpg`.
  L'orientació és cap on mira la façana: nord, sud, est, oest, o nord-est, etc.

## On pujar-les

A la carpeta `docs/fotos/`, en un PR (branca `fotos/<data>`), reduïdes a un màxim de 2000 px pel costat llarg
(~0,5–1 MB cadascuna). Si ho preferiu, adjunteu-les en un issue de GitHub i ja les moc jo.

## Llista (per ordre de prioritat)

| # | Què | Fotos |
| --- | --- | --- |
| 1 | **Edifici de la fila A** (p. ex. A5): façana llarga i façana curta | conjunt + detall de cada façana, entrada i porxo |
| 2 | **Edifici B, C o D** (p. ex. B6, FIB): façana llarga i curta | conjunt + detall, entrada principal |
| 3 | **Pavelló de vidre entre dos edificis A** (p. ex. entre A4 i A5) | conjunt des del passeig |
| 4 | **Omega** | les quatre façanes, entrada |
| 5 | **Biblioteca Rector Gabriel Ferraté** | façanes principals i entrada |
| 6 | **Plaça del Poliesportiu** (la gran plaça amb la claraboia rodona) | vista general des de 2–3 punts, baranes, escales i rampes |
| 7 | **Nexus I** (edifici rodó) i **Nexus II** | conjunt de cada façana visible |
| 8 | **Capella de Torre Girona** (MareNostrum), **BSC-Repsol**, **Til·lers**, **Residència** | conjunt de cada façana visible |
| 9 | **Passeigs entre files** (A–B, B–C, C–D) | una foto al llarg de cada passeig: paviment, arbres, fanals, bancs |
| 10 | **Escales, desnivells i murs** que connecten les files i les places | una foto de cada |
| 11 | **Mobiliari**: fanal, banc, paperera, aparcament de bicis, font | una foto de cada tipus |
| 12 | **Cobertes i pèrgoles** (la pèrgola blanca vora B3, porxos, passadissos coberts) | conjunt + detall |

Amb els punts 1, 2 i 6 ja es pot millorar molt la major part del campus.

## Què en faré

- **Referència de modelatge:** proporcions, nombre i forma de finestres, marcs, porxos, colors reals.
- **Textura directa:** algunes façanes (sobretot les singulars) s'aplicaran com a textura, un cop redreçades.
- **Comprovació:** cada foto es compararà amb una captura del joc des del mateix punt.
