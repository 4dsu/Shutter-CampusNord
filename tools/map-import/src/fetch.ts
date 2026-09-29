import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const USER_AGENT = "ShutterCampusNord-map-import/0.1 (joc de campus UPC; importa dades OSM una vegada)";

/**
 * Descarrega `url` i la desa a `cacheFile`. Si la cache ja existeix i no es demana `refresh`, no torna a baixar res
 * (l'API d'OSM demana no repetir peticions innecessàries).
 */
export async function cachedFetchText(url: string, cacheFile: string, refresh: boolean): Promise<string> {
  if (!refresh && existsSync(cacheFile)) {
    return readFile(cacheFile, "utf8");
  }
  console.log(`  ↓ ${url}`);
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} a ${url}`);
  const text = await res.text();
  await mkdir(dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, text);
  return text;
}
