/** Model del terreny en format ESRI ArcGrid (ASCII), tal com el retorna el WCS de l'ICGC. */
export interface Dem {
  ncols: number;
  nrows: number;
  /** Cantonada inferior esquerra (sud-oest) de la cel·la inferior esquerra. */
  xll: number;
  yll: number;
  cellSize: number;
  /** Valors per files de nord a sud. */
  values: Float32Array;
  nodata: number;
}

export function parseArcGrid(text: string): Dem {
  const tokens = text.split(/\s+/).filter(Boolean);
  const header: Record<string, number> = {};
  let i = 0;
  while (i < tokens.length && /^[a-z_]+$/i.test(tokens[i])) {
    header[tokens[i].toLowerCase()] = Number(tokens[i + 1]);
    i += 2;
  }
  const { ncols, nrows, cellsize } = header;
  if (!ncols || !nrows || !cellsize) throw new Error("ArcGrid: capçalera incompleta");
  const xll = header.xllcorner ?? header.xllcenter - cellsize / 2;
  const yll = header.yllcorner ?? header.yllcenter - cellsize / 2;
  const values = new Float32Array(ncols * nrows);
  for (let k = 0; k < values.length; k++) values[k] = Number(tokens[i + k]);
  return { ncols, nrows, xll, yll, cellSize: cellsize, values, nodata: header.nodata_value ?? -9999 };
}

/** Interpolació bilineal a les coordenades (easting, northing). Els valors són al centre de cada cel·la. */
export function sampleDem(dem: Dem, easting: number, northing: number): number {
  const u = (easting - dem.xll) / dem.cellSize - 0.5;
  const vFromSouth = (northing - dem.yll) / dem.cellSize - 0.5;
  const v = dem.nrows - 1 - vFromSouth;
  const c0 = Math.max(0, Math.min(dem.ncols - 2, Math.floor(u)));
  const r0 = Math.max(0, Math.min(dem.nrows - 2, Math.floor(v)));
  const fu = Math.max(0, Math.min(1, u - c0));
  const fv = Math.max(0, Math.min(1, v - r0));
  const at = (c: number, r: number): number => {
    const val = dem.values[r * dem.ncols + c];
    if (val === dem.nodata) throw new Error(`Terreny sense dades a (${easting.toFixed(0)}, ${northing.toFixed(0)})`);
    return val;
  };
  const top = at(c0, r0) * (1 - fu) + at(c0 + 1, r0) * fu;
  const bottom = at(c0, r0 + 1) * (1 - fu) + at(c0 + 1, r0 + 1) * fu;
  return top * (1 - fv) + bottom * fv;
}
