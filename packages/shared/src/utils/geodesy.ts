/**
 * @file packages/shared/src/utils/geodesy.ts
 * Motor Geodésico de Projeção para Realidade Aumentada (WGS84 -> ENU -> Frustum AR).
 *
 * Implementa cálculos de distância, azimute geodésico (Bearing), conversão no Plano
 * Tangente Local (East-North-Up) e compensação da Declinação Magnética de Sorocaba/SP (-21.3°).
 */

export const EARTH_RADIUS_METERS = 6371000;
export const WGS84_A = 6378137.0; // Semi-eixo maior em metros
export const WGS84_E2 = 0.00669437999014; // Primeira excentricidade ao quadrado

/**
 * Declinação Magnética medida para Sorocaba/SP (Campus UniFACENS): -21° 18' (~ -21.3° Oeste).
 * O magnetômetro móvel aponta para o Norte Magnético; somar este valor alinha com o Norte Verdadeiro.
 */
export const SOROCABA_MAGNETIC_DECLINATION = -21.3;

export const toRadians = (deg: number): number => (deg * Math.PI) / 180;
export const toDegrees = (rad: number): number => (rad * 180) / Math.PI;

export const normalizeDegrees = (deg: number): number => {
  return ((deg % 360) + 360) % 360;
};

/**
 * Calcula a distância horizontal geodésica em metros entre dois pontos WGS84 via fórmula de Haversine.
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const rLat1 = toRadians(lat1);
  const rLat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Number((EARTH_RADIUS_METERS * c).toFixed(2));
}

/**
 * Calcula o azimute inicial (Bearing) em graus [0, 360) a partir da posição de origem até o destino,
 * em relação ao Norte Verdadeiro Geográfico.
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const rLat1 = toRadians(lat1);
  const rLat2 = toRadians(lat2);
  const dLon = toRadians(lon2 - lon1);

  const y = Math.sin(dLon) * Math.cos(rLat2);
  const x =
    Math.cos(rLat1) * Math.sin(rLat2) -
    Math.sin(rLat1) * Math.cos(rLat2) * Math.cos(dLon);

  const bearingRad = Math.atan2(y, x);
  return Number(normalizeDegrees(toDegrees(bearingRad)).toFixed(2));
}

/**
 * Converte coordenadas geodésicas (WGS84) para o Plano Tangente Local ENU (East, North, Up)
 * em metros centradas na posição do usuário.
 */
export function geodeticToENU(
  userLat: number,
  userLon: number,
  userAlt: number,
  targetLat: number,
  targetLon: number,
  targetAlt: number,
): { east: number; north: number; up: number } {
  const phi0 = toRadians(userLat);
  const dLat = toRadians(targetLat - userLat);
  const dLon = toRadians(targetLon - userLon);

  const sinPhi = Math.sin(phi0);
  const cosPhi = Math.cos(phi0);

  // Raios de curvatura do elipsoide WGS-84
  const rLat = (WGS84_A * (1 - WGS84_E2)) / Math.pow(1 - WGS84_E2 * sinPhi * sinPhi, 1.5);
  const rLon = (WGS84_A * cosPhi) / Math.sqrt(1 - WGS84_E2 * sinPhi * sinPhi);

  const east = dLon * rLon;
  const north = dLat * rLat;
  const up = targetAlt - userAlt;

  return {
    east: Number(east.toFixed(2)),
    north: Number(north.toFixed(2)),
    up: Number(up.toFixed(2)),
  };
}

/**
 * Inversa exata de `geodeticToENU` (mesmos raios de curvatura WGS84):
 * converte um deslocamento ENU em metros para deltas de lat/lng/alt.
 * Garante roundtrip identidade na criação de pins (tap SLAM → WGS84).
 */
export function enuToGeodetic(
  userLat: number,
  userLon: number,
  userAlt: number,
  east: number,
  north: number,
  up: number,
): { latitude: number; longitude: number; altitude: number } {
  const phi0 = toRadians(userLat);
  const sinPhi = Math.sin(phi0);
  const cosPhi = Math.cos(phi0);

  // Mesmos raios de curvatura do elipsoide WGS-84 usados em geodeticToENU
  const rLat = (WGS84_A * (1 - WGS84_E2)) / Math.pow(1 - WGS84_E2 * sinPhi * sinPhi, 1.5);
  const rLon = (WGS84_A * cosPhi) / Math.sqrt(1 - WGS84_E2 * sinPhi * sinPhi);

  return {
    latitude: userLat + toDegrees(north / rLat),
    longitude: userLon + toDegrees(east / rLon),
    altitude: userAlt + up,
  };
}

/**
 * Rotaciona um deslocamento ENU (East/North) para o frame AR (X/Z) dado o
 * azimute Δ do mundo AR da sessão — o azimute verdadeiro do eixo -Z do mundo.
 *
 * x_AR = east·cos(Δ) − north·sin(Δ)
 * z_AR = −(east·sin(Δ) + north·cos(Δ))
 *
 * A matriz de rotação do plano tangente é INVOLUTIVA (M² = I): a própria inversa.
 */
export function enuToArXZ(
  east: number,
  north: number,
  deltaDeg: number,
): { x: number; z: number } {
  const rad = toRadians(deltaDeg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: east * cos - north * sin, z: -(east * sin + north * cos) };
}

/**
 * Inversa de `enuToArXZ`: offset no frame AR da sessão → ENU local.
 * Como M² = I, usa exatamente a MESMA forma da direta.
 */
export function arXZToEnu(
  arX: number,
  arZ: number,
  deltaDeg: number,
): { east: number; north: number } {
  const rad = toRadians(deltaDeg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { east: arX * cos - arZ * sin, north: -(arX * sin + arZ * cos) };
}

/**
 * Converte o Heading Magnético lido pelos sensores do celular para o Norte Verdadeiro
 * aplicando a declinação de Sorocaba/SP.
 */
export function magneticToTrueHeading(
  magneticHeadingDegrees: number,
  declination: number = SOROCABA_MAGNETIC_DECLINATION,
): number {
  return normalizeDegrees(magneticHeadingDegrees + declination);
}

/**
 * Mapeia as coordenadas métricas ENU para o sistema de coordenadas cartesianas do Viro AR
 * baseado na rotação da câmera (True Heading).
 *
 * Convenção Viro AR:
 * - Eixo +X: Direita do usuário
 * - Eixo +Y: Cima (alinhado com a gravidade)
 * - Eixo -Z: Frente do campo de visão (visada da câmera)
 */
export function calculateRelativeARPosition(
  userLat: number,
  userLon: number,
  userAlt: number,
  userTrueHeading: number,
  targetLat: number,
  targetLon: number,
  targetAlt: number,
  cameraHeight = 1.4,
): [number, number, number] {
  const { east, north, up } = geodeticToENU(
    userLat,
    userLon,
    userAlt,
    targetLat,
    targetLon,
    targetAlt,
  );

  const headingRad = toRadians(userTrueHeading);
  const cosH = Math.cos(headingRad);
  const sinH = Math.sin(headingRad);

  // Rotação em torno do eixo Y:
  // x_AR = east * cos(H) - north * sin(H)
  // z_AR = -(east * sin(H) + north * cos(H))
  const xAR = east * cosH - north * sinH;
  const zAR = -(east * sinH + north * cosH);
  const yAR = up - cameraHeight;

  return [
    Number(xAR.toFixed(2)),
    Number(yAR.toFixed(2)),
    Number(zAR.toFixed(2)),
  ];
}

/**
 * Filtro Passa-Baixa Circular (Exponential Moving Average em vetores unitários).
 * Elimina o ruído e jitter da bússola em smartphones sem descontinuidade em 0°/360°.
 */
export class CircularLowPassFilter {
  private sinAvg = 0;
  private cosAvg = 0;
  private isInitialized = false;
  private readonly alpha: number;

  constructor(alpha = 0.15) {
    this.alpha = Math.max(0.01, Math.min(1.0, alpha));
  }

  update(rawHeadingDegrees: number): number {
    const rad = toRadians(rawHeadingDegrees);
    const currentSin = Math.sin(rad);
    const currentCos = Math.cos(rad);

    if (!this.isInitialized) {
      this.sinAvg = currentSin;
      this.cosAvg = currentCos;
      this.isInitialized = true;
    } else {
      this.sinAvg = this.alpha * currentSin + (1 - this.alpha) * this.sinAvg;
      this.cosAvg = this.alpha * currentCos + (1 - this.alpha) * this.cosAvg;
    }

    const filteredRad = Math.atan2(this.sinAvg, this.cosAvg);
    return Number(normalizeDegrees(toDegrees(filteredRad)).toFixed(2));
  }

  reset(): void {
    this.isInitialized = false;
    this.sinAvg = 0;
    this.cosAvg = 0;
  }
}
