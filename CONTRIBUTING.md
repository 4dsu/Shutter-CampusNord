# Com col·laborar

Som diverses persones, cadascuna amb el seu agent d'IA. Aquestes normes serveixen perquè la feina no es barregi.
Les instruccions completes per als agents són a [AGENTS.md](AGENTS.md). Doneu-les al vostre agent abans de començar.

## Flux de treball

1. **Actualitza `main`:** `git switch main && git pull`.
2. **Tria una tasca** del [full de ruta](docs/ROADMAP.md). Si és gran, obre un issue i assigna-te-la.
   Mira els PR oberts (`gh pr list`) per no repetir feina.
3. **Crea una branca:** `git switch -c fase-2/nom-de-la-tasca`.
4. **Treballa amb commits petits** i fes push sovint: `git push -u origin fase-2/nom-de-la-tasca`.
5. **Obre un Pull Request aviat** (pot ser *draft*) i omple la plantilla.
6. **Abans de demanar la fusió:**
   ```bash
   git fetch && git rebase origin/main
   npm run typecheck && npm test
   ```
7. **Es fusiona a `main` amb *squash*** quan la CI passa. Esborra la branca després.

## Normes

- Mai no facis push directament a `main`, ni `push --force` a branques d'altres.
- Actualitza `docs/ROADMAP.md` al mateix PR que fa la feina.
- Si has de tocar fitxers que un altre PR obert també toca (`types.ts`, `main.ts`, el mapa…), avisa-ho al PR.
- No editis `assets/maps/campus-nord.json` a mà. Canvia l'importador i executa `npm run map:import`.
- Idioma: la interfície, els comentaris, la documentació i els commits en català; els identificadors en anglès.
