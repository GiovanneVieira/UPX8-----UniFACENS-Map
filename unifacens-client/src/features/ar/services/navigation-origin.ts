import { calculateDistance } from 'shared';

type NavigationOrigin = {
  latitude: number;
  longitude: number;
  altitude: number;
};

export class NavigationOriginError extends Error {}

export function validateNavigationOrigin<T extends NavigationOrigin>(
  origin: T,
  available: boolean,
): T {
  if (
    !available ||
    !Number.isFinite(origin.latitude) ||
    !Number.isFinite(origin.longitude) ||
    !Number.isFinite(origin.altitude) ||
    Math.abs(origin.latitude) > 90 ||
    Math.abs(origin.longitude) > 180
  ) {
    throw new NavigationOriginError(
      'Localização indisponível. Ative a localização e aguarde o GPS ou calibre em um marco onde você está.',
    );
  }

  if (
    calculateDistance(origin.latitude, origin.longitude, -23.4699, -47.4297) >
    1000
  ) {
    throw new NavigationOriginError(
      'Você está fora da área de navegação do campus. Aproxime-se da UniFACENS para iniciar uma rota.',
    );
  }

  return origin;
}
