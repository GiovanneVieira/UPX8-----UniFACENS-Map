/**
 * Constantes geográficas do campus UniFACENS (SSOT para API e Client).
 *
 * `CAMPUS_BBOX` espelha o bbox da fixture da malha caminhável
 * (`unifacens-api/src/modules/routing/campus-fixture.ts`) — as duas fontes
 * devem ser atualizadas juntas quando o campus mudar.
 */

/** Bounding box do campus UniFACENS (Sorocaba/SP). */
export const CAMPUS_BBOX = {
  minLat: -23.4715,
  minLng: -47.431,
  maxLat: -23.4685,
  maxLng: -47.428,
} as const;

/** Altitude de referência (datum) do campus — terreno plano, ~605m. */
export const CAMPUS_DATUM_ALTITUDE_M = 605;

/** Verifica se uma coordenada WGS84 está dentro do bbox do campus. */
export function isPointInCampusBBox(latitude: number, longitude: number): boolean {
  return (
    latitude >= CAMPUS_BBOX.minLat &&
    latitude <= CAMPUS_BBOX.maxLat &&
    longitude >= CAMPUS_BBOX.minLng &&
    longitude <= CAMPUS_BBOX.maxLng
  );
}
