import type { Frame, GridSpec } from "./build.ts";
import { cachedFetchBinary } from "./fetch.ts";

/** Capa de l'ortofoto de l'ICGC (any fix perquè el mapa es pugui regenerar igual). */
export const ORTHO_LAYER = "ortofoto_25cm_color_2025";
/** Resolució de l'ortofoto al joc (m/píxel). */
export const ORTHO_RESOLUTION = 0.25;
const MAX_PIXELS = 4096;

/**
 * Descarrega l'ortofoto que cobreix exactament la graella del terreny (EPSG:25831, la mateixa projecció que el joc).
 * La fila 0 de la imatge és el nord (z mínima), com la textura del terra.
 */
export async function fetchOrthophoto(frame: Frame, grid: GridSpec, cacheDir: string, refresh: boolean): Promise<{ jpeg: Buffer; width: number; height: number }> {
  const widthM = (grid.cols - 1) * grid.cellSize;
  const depthM = (grid.rows - 1) * grid.cellSize;
  const res = Math.max(ORTHO_RESOLUTION, widthM / MAX_PIXELS, depthM / MAX_PIXELS);
  const width = Math.round(widthM / res);
  const height = Math.round(depthM / res);
  const minE = frame.e0 + grid.originX;
  const maxE = minE + widthM;
  const maxN = frame.n0 - grid.originZ;
  const minN = maxN - depthM;
  const url =
    "https://geoserveis.icgc.cat/servei/catalunya/orto-territorial/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap" +
    `&LAYERS=${ORTHO_LAYER}&STYLES=&CRS=EPSG:25831&BBOX=${minE},${minN},${maxE},${maxN}` +
    `&WIDTH=${width}&HEIGHT=${height}&FORMAT=image/jpeg`;
  const jpeg = await cachedFetchBinary(url, `${cacheDir}orto-${ORTHO_LAYER}-${minE}-${minN}-${width}x${height}.jpg`, refresh, "image/jpeg");
  return { jpeg, width, height };
}
