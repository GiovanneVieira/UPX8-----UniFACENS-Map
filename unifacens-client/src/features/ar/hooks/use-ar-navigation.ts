import { useCallback, useEffect, useState } from 'react';
import { calculateRelativeARPosition, type Anchor } from 'shared';
import { requestRoute } from '../services/routing-api';
import { createNavigationRequest } from '../services/navigation-request';
import {
  NavigationOriginError,
  validateNavigationOrigin,
} from '../services/navigation-origin';

export interface ARRouteState {
  active: boolean;
  /** Path WGS84 vindo do backend. */
  wgs84Path: Array<{ latitude: number; longitude: number }>;
  /** Path projetado no espaço AR local (para renderização de setas). */
  arPath: Array<[number, number, number]>;
  distanceRemaining: number;
  targetName: string;
  isLoading: boolean;
  error: string | null;
}

interface UseARNavigationParams {
  isLocationAvailable: () => boolean;
  /** Coordenadas atuais do usuário (GPS/calibrado). */
  userCoordsRef: React.MutableRefObject<{
    latitude: number;
    longitude: number;
    altitude: number;
    accuracy: number;
  }>;
  /** Heading de referência da sessão AR (para projeção WGS84→AR). */
  referenceHeadingRef: React.MutableRefObject<number | null>;
  /** Coordenadas de referência para a projeção (origem do AR). */
  projectionOrigin: () => {
    latitude: number;
    longitude: number;
    altitude: number;
  };
}

const EMPTY_ROUTE: ARRouteState = {
  active: false,
  wgs84Path: [],
  arPath: [],
  distanceRemaining: 0,
  targetName: '',
  isLoading: false,
  error: null,
};

/**
 * Hook de navegação AR (C4): calcula a rota no backend, projeta a polyline
 * WGS84 no espaço AR local via motor geodésico do shared, e expõe estado
 * reativo para o HUD e a cena Viro.
 */
export function useARNavigation({
  isLocationAvailable,
  userCoordsRef,
  referenceHeadingRef,
  projectionOrigin,
}: UseARNavigationParams) {
  const [route, setRoute] = useState<ARRouteState>(EMPTY_ROUTE);
  const [navigationRequest] = useState(createNavigationRequest);

  useEffect(() => () => navigationRequest.cancel(), [navigationRequest]);

  /** Inicia navegação para uma âncora: chama /routing/route e projeta. */
  const startNavigation = useCallback(
    async (anchor: Anchor) => {
      navigationRequest.cancel();
      if (
        !Number.isFinite(anchor.latitude) ||
        !Number.isFinite(anchor.longitude)
      ) {
        setRoute({
          ...EMPTY_ROUTE,
          error: 'Este destino não possui coordenadas válidas.',
        });
        return;
      }

      setRoute({ ...EMPTY_ROUTE, isLoading: true, targetName: anchor.name });

      await navigationRequest.run(
        async (signal) => {
          const origin = validateNavigationOrigin(
            projectionOrigin(),
            isLocationAvailable(),
          );

          console.log(
            '[AR Nav] origin:',
            JSON.stringify({
              lat: origin.latitude.toFixed(6),
              lng: origin.longitude.toFixed(6),
            }),
          );
          console.log(
            '[AR Nav] target:',
            JSON.stringify({
              id: anchor.id,
              name: anchor.name,
              lat: anchor.latitude,
              lng: anchor.longitude,
            }),
          );

          const response = await requestRoute(
            { latitude: origin.latitude, longitude: origin.longitude },
            { anchorId: anchor.id },
            signal,
          );

          console.log(
            '[AR Nav] ROTA OK:',
            JSON.stringify({
              pts: response.path.length,
              dist: response.distanceMeters,
              segs: response.segments.length,
            }),
          );
          console.log('[AR Nav] path[0]:', JSON.stringify(response.path[0]));
          console.log(
            '[AR Nav] path[last]:',
            JSON.stringify(response.path[response.path.length - 1]),
          );

          const heading = referenceHeadingRef.current ?? 0;
          const projOrigin = validateNavigationOrigin(
            projectionOrigin(),
            isLocationAvailable(),
          );

          const arPath: Array<[number, number, number]> = response.path.map(
            (point) =>
              calculateRelativeARPosition(
                projOrigin.latitude,
                projOrigin.longitude,
                projOrigin.altitude,
                heading,
                point.latitude,
                point.longitude,
                projOrigin.altitude,
              ),
          );

          console.log(
            '[AR Nav] AR path[0]:',
            JSON.stringify(arPath[0]?.map((v) => Number(v.toFixed(2)))),
          );
          console.log(
            '[AR Nav] AR path[last]:',
            JSON.stringify(
              arPath[arPath.length - 1]?.map((v) => Number(v.toFixed(2))),
            ),
          );

          return {
            active: true,
            wgs84Path: response.path,
            arPath,
            distanceRemaining: response.distanceMeters,
            targetName: anchor.name,
            isLoading: false,
            error: null,
          };
        },
        setRoute,
        (err) => {
          setRoute({
            ...EMPTY_ROUTE,
            error:
              err instanceof NavigationOriginError ||
              (err instanceof Error &&
                err.message === 'Sessão expirada. Faça login novamente.')
                ? err.message
                : 'Não foi possível calcular a rota. Confira a conexão e selecione o destino novamente.',
          });
        },
      );
    },
    [
      navigationRequest,
      userCoordsRef,
      referenceHeadingRef,
      projectionOrigin,
      isLocationAvailable,
    ],
  );

  /** Encerra a navegação. */
  const stopNavigation = useCallback(() => {
    navigationRequest.cancel();
    setRoute(EMPTY_ROUTE);
  }, [navigationRequest]);

  /** Atualiza a distância restante com base na posição atual do usuário. */
  const updateDistance = useCallback((userLat: number, userLng: number) => {
    setRoute((prev) => {
      if (!prev.active || prev.wgs84Path.length === 0) return prev;
      const last = prev.wgs84Path[prev.wgs84Path.length - 1]!;
      // Haversine simplificada
      const R = 6371000;
      const dLat = ((last.latitude - userLat) * Math.PI) / 180;
      const dLng = ((last.longitude - userLng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((userLat * Math.PI) / 180) *
          Math.cos((last.latitude * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return { ...prev, distanceRemaining: Math.round(dist) };
    });
  }, []);

  return { route, startNavigation, stopNavigation, updateDistance };
}
