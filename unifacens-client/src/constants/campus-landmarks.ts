/**
 * Marcos físicos conhecidos do campus UniFACENS utilizados pela
 * Calibração Zero-Marker (pinpoint em entrada/marco para zerar o desvio
 * do GPS e deixar o Visual SLAM do ARCore assumir a precisão).
 */
export interface CampusLandmark {
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  altitude: number;
}

export const CAMPUS_CALIBRATION_POINTS: CampusLandmark[] = [
  {
    name: 'Ponto Central (Origem Facens)',
    description: 'Praça central do campus Facens',
    latitude: -23.4699,
    longitude: -47.4297,
    altitude: 605,
  },
  {
    name: 'Bloco A (Engenharias)',
    description: 'Entrada principal do Bloco A',
    latitude: -23.47035,
    longitude: -47.4294,
    altitude: 606,
  },
  {
    name: 'Bloco B (Laboratórios)',
    description: 'Entrada dos laboratórios e oficinas',
    latitude: -23.4695,
    longitude: -47.42995,
    altitude: 605,
  },
  {
    name: 'Biblioteca Universitária',
    description: 'Entrada da biblioteca e centro de estudos',
    latitude: -23.4701,
    longitude: -47.4302,
    altitude: 605,
  },
];
