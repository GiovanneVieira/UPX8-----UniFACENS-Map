import { describe, it, expect } from 'vitest';
import {
  calculateDistance,
  calculateBearing,
  geodeticToENU,
  magneticToTrueHeading,
  calculateRelativeARPosition,
  CircularLowPassFilter,
  SOROCABA_MAGNETIC_DECLINATION,
} from 'shared';

describe('Geodesy Utility (Motor Geodésico de Projeção AR)', () => {
  // Ponto Central (Praça do Campus UniFACENS)
  const facensOrigin = {
    lat: -23.4699,
    lon: -47.4297,
    alt: 605,
  };

  // Bloco A (Engenharias) - a sudeste da praça central
  const blocoA = {
    lat: -23.47035,
    lon: -47.4294,
    alt: 606,
  };

  it('deve calcular a distância horizontal em metros com precisão geodésica', () => {
    const dist = calculateDistance(
      facensOrigin.lat,
      facensOrigin.lon,
      blocoA.lat,
      blocoA.lon,
    );

    // Distância real esperada entre esses dois pontos no campus: ~59 metros
    expect(dist).toBeGreaterThan(50);
    expect(dist).toBeLessThan(70);
    expect(typeof dist).toBe('number');
  });

  it('deve retornar 0 metros para o mesmo ponto', () => {
    const dist = calculateDistance(
      facensOrigin.lat,
      facensOrigin.lon,
      facensOrigin.lat,
      facensOrigin.lon,
    );
    expect(dist).toBe(0);
  });

  it('deve calcular o azimute (Bearing) correto em relação ao Norte Verdadeiro', () => {
    // Ponto diretamente ao Norte (latitude maior)
    const northPoint = { lat: facensOrigin.lat + 0.001, lon: facensOrigin.lon };
    const bearingNorth = calculateBearing(
      facensOrigin.lat,
      facensOrigin.lon,
      northPoint.lat,
      northPoint.lon,
    );
    expect(Math.round(bearingNorth)).toBe(0);

    // Ponto diretamente a Leste (longitude maior)
    const eastPoint = { lat: facensOrigin.lat, lon: facensOrigin.lon + 0.001 };
    const bearingEast = calculateBearing(
      facensOrigin.lat,
      facensOrigin.lon,
      eastPoint.lat,
      eastPoint.lon,
    );
    expect(Math.round(bearingEast)).toBe(90);
  });

  it('deve converter coordenadas geodésicas para o Plano Tangente Local (ENU)', () => {
    const enu = geodeticToENU(
      facensOrigin.lat,
      facensOrigin.lon,
      facensOrigin.alt,
      blocoA.lat,
      blocoA.lon,
      blocoA.alt,
    );

    // Bloco A está a Sudeste da praça: East deve ser positivo (+X), North deve ser negativo (-Y), Up deve ser +1m
    expect(enu.east).toBeGreaterThan(0);
    expect(enu.north).toBeLessThan(0);
    expect(enu.up).toBe(1);
  });

  it('deve compensar a Declinação Magnética de Sorocaba (-21.3° Oeste)', () => {
    expect(SOROCABA_MAGNETIC_DECLINATION).toBe(-21.3);

    // Se a bússola magnética marca 100°, o Norte Verdadeiro deve ser 100 - 21.3 = 78.7°
    const trueHeading = magneticToTrueHeading(100);
    expect(trueHeading).toBeCloseTo(78.7, 1);

    // Teste de wrap-around negativo: 10° - 21.3° = 348.7°
    const wrappedHeading = magneticToTrueHeading(10);
    expect(wrappedHeading).toBeCloseTo(348.7, 1);
  });

  it('deve mapear coordenadas ENU para os eixos cartesianos da câmera Viro AR', () => {
    // Usuário olhando para o Norte Verdadeiro (heading = 0°)
    const arPosNorth = calculateRelativeARPosition(
      facensOrigin.lat,
      facensOrigin.lon,
      facensOrigin.alt,
      0, // Heading = 0 (olhando para o Norte)
      blocoA.lat,
      blocoA.lon,
      blocoA.alt,
      1.4, // Altura dos olhos
    );

    // Bloco A está a Sudeste (Leste > 0, Norte < 0).
    // Olhando para o Norte: Leste está à direita (+X), Sul está atrás (+Z no AR, pois frente é -Z).
    expect(arPosNorth[0]).toBeGreaterThan(0); // +X à direita
    expect(arPosNorth[2]).toBeGreaterThan(0); // +Z atrás
    expect(arPosNorth[1]).toBeCloseTo(-0.4, 1); // 1.0m up - 1.4m camera = -0.4m
  });

  it('deve filtrar ruído da bússola via CircularLowPassFilter sem descontinuidade em 0°/360°', () => {
    const filter = new CircularLowPassFilter(0.2);

    // Inicializa em 358°
    const h1 = filter.update(358);
    expect(h1).toBe(358);

    // Próxima leitura oscila para 2° (cruzou o Norte)
    const h2 = filter.update(2);
    // Em um filtro linear ingênuo, a média de 358 e 2 seria 180° (Sul - erro catastrófico!).
    // No filtro circular vetorial, deve ficar suavemente em torno de 359° ou 0°.
    expect(h2).toBeGreaterThanOrEqual(358);
    expect(h2).toBeLessThanOrEqual(360);
  });
});
