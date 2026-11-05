/**
 * Grid caminhável do campus (C2): rasteriza obstáculos em células de ~2m
 * sobre o bbox, marcando células bloqueadas via point-in-polygon (ray casting).
 * Entradas e âncoras são snapadas para a célula caminhável mais próxima.
 */

export interface WalkableGrid {
  cols: number;
  rows: number;
  cellSizeM: number;
  minLat: number;
  minLng: number;
  /** blocked[row][col] = true se célula está dentro de um obstáculo. */
  blocked: boolean[][];
}

export interface ObstaclePolygon {
  id: string;
  polygon: Array<[number, number]>;
}

/** Ray casting: retorna true se o ponto está DENTRO do polígono. */
export function pointInPolygon(
  lat: number,
  lng: number,
  polygon: Array<[number, number]>,
): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [latI, lngI] = polygon[i]!;
    const [latJ, lngJ] = polygon[j]!;
    if (
      latI > lat !== latJ > lat &&
      lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Constrói o grid: células de cellSizeM metros, obstáculos inflados por margem. */
export function buildGrid(
  bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number },
  obstacles: ObstaclePolygon[],
  cellSizeM = 2,
  marginM = 1,
): WalkableGrid {
  // ~1 metro em graus (aproximação para Sorocaba)
  const M_LAT = 0.00000904;
  const M_LNG = 0.00001016;

  const latSpan = (bbox.maxLat - bbox.minLat) / (M_LAT * cellSizeM);
  const lngSpan = (bbox.maxLng - bbox.minLng) / (M_LNG * cellSizeM);
  const cols = Math.ceil(lngSpan);
  const rows = Math.ceil(latSpan);

  const grid: WalkableGrid = {
    cols,
    rows,
    cellSizeM,
    minLat: bbox.minLat,
    minLng: bbox.minLng,
    blocked: Array.from({ length: rows }, () => Array.from({ length: cols }, () => false).fill(false)),
  };

  const marginLat = marginM * M_LAT;
  const marginLng = marginM * M_LNG;

  // Rasteriza: para cada célula, checa se o centro está dentro de algum
  // polígono inflado pela margem.
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const centerLat = grid.minLat + (row + 0.5) * cellSizeM * M_LAT;
      const centerLng = grid.minLng + (col + 0.5) * cellSizeM * M_LNG;

      for (const obs of obstacles) {
        // BBox check rápido antes do ray casting
        let minOLat = Infinity, maxOLat = -Infinity, minOLng = Infinity, maxOLng = -Infinity;
        for (const [lat, lng] of obs.polygon) {
          if (lat < minOLat) minOLat = lat;
          if (lat > maxOLat) maxOLat = lat;
          if (lng < minOLng) minOLng = lng;
          if (lng > maxOLng) maxOLng = lng;
        }
        if (
          centerLat < minOLat - marginLat || centerLat > maxOLat + marginLat ||
          centerLng < minOLng - marginLng || centerLng > maxOLng + marginLng
        ) {
          continue;
        }

        if (pointInPolygon(centerLat, centerLng, obs.polygon)) {
          grid.blocked[row]![col] = true;
          break;
        }
        // Checa margem: se está dentro do polígono expandido (aproximação por bbox)
        if (
          centerLat >= minOLat - marginLat && centerLat <= maxOLat + marginLat &&
          centerLng >= minOLng - marginLng && centerLng <= maxOLng + marginLng &&
          pointInPolygon(centerLat, centerLng, obs.polygon)
        ) {
          grid.blocked[row]![col] = true;
          break;
        }
      }
    }
  }

  return grid;
}

/** Converte lat/lng para índices de célula. */
export function latLngToCell(
  grid: WalkableGrid,
  lat: number,
  lng: number,
): { row: number; col: number } {
  const M_LAT = 0.00000904;
  const M_LNG = 0.00001016;
  const row = Math.floor((lat - grid.minLat) / (grid.cellSizeM * M_LAT));
  const col = Math.floor((lng - grid.minLng) / (grid.cellSizeM * M_LNG));
  return {
    row: Math.max(0, Math.min(grid.rows - 1, row)),
    col: Math.max(0, Math.min(grid.cols - 1, col)),
  };
}

/** Converte índices de célula para lat/lng do centro. */
export function cellToLatLng(
  grid: WalkableGrid,
  row: number,
  col: number,
): { latitude: number; longitude: number } {
  const M_LAT = 0.00000904;
  const M_LNG = 0.00001016;
  return {
    latitude: grid.minLat + (row + 0.5) * grid.cellSizeM * M_LAT,
    longitude: grid.minLng + (col + 0.5) * grid.cellSizeM * M_LNG,
  };
}

/** Snappa uma coordenada para a célula caminhável mais próxima (busca em espiral). */
export function snapToWalkable(
  grid: WalkableGrid,
  lat: number,
  lng: number,
): { row: number; col: number } {
  const { row, col } = latLngToCell(grid, lat, lng);
  if (!grid.blocked[row]![col]) return { row, col };

  // Busca em espiral até raio 15 células (~30m)
  for (let radius = 1; radius <= 15; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue; // só a borda
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= grid.rows || c < 0 || c >= grid.cols) continue;
        if (!grid.blocked[r]![c]) return { row: r, col: c };
      }
    }
  }
  return { row, col }; // fallback
}
