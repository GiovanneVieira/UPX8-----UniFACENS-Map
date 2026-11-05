/**
 * Fixture da malha caminhável do campus UniFACENS (C2).
 *
 * Footprints simplificados (retângulos aproximados a partir das coordenadas
 * de referência dos places) + entradas de prédios. Formato: [lat, lng].
 *
 * ESTE ARQUIVO é a fonte de verdade da malha — atualize quando o campus mudar.
 */
export interface CampusFixture {
  bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number };
  obstacles: Array<{
    id: string;
    name: string;
    category: 'building' | 'water' | 'restricted';
    polygon: Array<[number, number]>;
  }>;
  entrances: Array<{
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    altitude?: number;
    accessible?: boolean;
    obstacleId?: string;
  }>;
}

// ~1 metro em graus de latitude no campus (Sorocaba/SP)
const M_LAT = 0.00000904;
// ~1 metro em graus de longitude (ajustado pela latitude de Sorocaba)
const M_LNG = 0.00001016;

/** Cria um footprint retangular aproximado em torno de um centro. */
function rect(
  centerLat: number,
  centerLng: number,
  widthM: number,
  heightM: number,
): Array<[number, number]> {
  const dLat = (heightM / 2) * M_LAT;
  const dLng = (widthM / 2) * M_LNG;
  return [
    [centerLat - dLat, centerLng - dLng],
    [centerLat - dLat, centerLng + dLng],
    [centerLat + dLat, centerLng + dLng],
    [centerLat + dLat, centerLng - dLng],
  ];
}

export const CAMPUS_FIXTURE: CampusFixture = {
  bbox: {
    minLat: -23.4715,
    minLng: -47.4310,
    maxLat: -23.4685,
    maxLng: -47.4280,
  },
  obstacles: [
    {
      id: 'bloco-a',
      name: 'Bloco A (Engenharias)',
      category: 'building',
      polygon: rect(-23.47035, -47.4294, 50, 30),
    },
    {
      id: 'bloco-b',
      name: 'Bloco B (Laboratórios)',
      category: 'building',
      polygon: rect(-23.4695, -47.42995, 60, 25),
    },
    {
      id: 'bloco-c',
      name: 'Bloco C (Salas de Aula)',
      category: 'building',
      polygon: rect(-23.4701, -47.4302, 40, 35),
    },
    {
      id: 'biblioteca',
      name: 'Biblioteca Universitária',
      category: 'building',
      polygon: rect(-23.4698, -47.4301, 35, 25),
    },
    {
      id: 'lab-territorio',
      name: 'Laboratório Território',
      category: 'building',
      polygon: rect(-23.4702, -47.42975, 30, 20),
    },
  ],
  entrances: [
    {
      id: 'entrada-bloco-a',
      name: 'Entrada Bloco A',
      latitude: -23.47035 + 18 * M_LAT,
      longitude: -47.4294,
      obstacleId: 'bloco-a',
    },
    {
      id: 'entrada-bloco-b',
      name: 'Entrada Bloco B',
      latitude: -23.4695 + 15 * M_LAT,
      longitude: -47.42995,
      obstacleId: 'bloco-b',
    },
    {
      id: 'entrada-bloco-c',
      name: 'Entrada Bloco C',
      latitude: -23.4701 + 20 * M_LAT,
      longitude: -47.4302,
      obstacleId: 'bloco-c',
    },
    {
      id: 'entrada-biblioteca',
      name: 'Entrada Biblioteca',
      latitude: -23.4698 + 15 * M_LAT,
      longitude: -47.4301,
      obstacleId: 'biblioteca',
    },
  ],
};
