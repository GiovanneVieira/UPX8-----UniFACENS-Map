import { useCallback, useRef, useState } from 'react';
import {
  calculateRelativeARPosition,
  type Anchor,
} from 'shared';
import { requestRoute } from '../services/routing-api';

export interface ARRouteState {
  active: boolean;
  /** Path WGS84 vindo do backend. */
  wgs84Path: Array<{ latitude: number; longitude: number }>;
  /** Path projetado no espaço AR local (para renderização de setas). */
  arPath: Array<[number, number, number]>;
  distanceRemaining: number;
  targetName: string;
  isLoading: boolean;
}

interface UseARNavigationParams {
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
  projectionOrigin: () => { latitude: number; longitude: number; altitude: number };
}

const EMPTY_ROUTE: ARRouteState = {
  active: false,
  wgs84Path: [],
  arPath: [],
  distanceRemaining: 0,
  targetName: '',
  isLoading: false,
};

/**
 * Hook de navegação AR (C4): calcula a rota no backend, projeta a polyline
 * WGS84 no espaço AR local via motor geodésico do shared, e expõe estado
 * reativo para o HUD e a cena Viro.
 */
export function useARNavigation({
  userCoordsRef,
  referenceHeadingRef,
  projectionOrigin,
}: UseARNavigationParams) {
  const [route, setRoute] = useState<ARRouteState>(EMPTY_ROUTE);
  const lastRerouteRef = useRef(0);

  /** Inicia navegação para uma âncora: chama /routing/route e projeta. */
  const startNavigation = useCallback(
    async (anchor: Anchor) => {
      if (!anchor.latitude || !anchor.longitude) return;

      setRoute((prev) => ({ ...prev, isLoading: true, targetName: anchor.name }));
      lastRerouteRef.current = Date.now();

      try {
        const origin = userCoordsRef.current;
        const response = await requestRoute(
          { latitude: origin.latitude, longitude: origin.longitude },
          { anchorId: anchor.id },
        );

        // Projeta cada waypoint WGS84 → AR local
        const heading =
          referenceHeadingRef.current ?? 0;
        const originCoords = projectionOrigin();
        const arPath: Array<[number, number, number]> = response.path.map((point) =>
          calculateRelativeARPosition(
            originCoords.latitude,
            originCoords.longitude,
            originCoords.altitude,
            heading,
            point.latitude,
            point.longitude,
            originCoords.altitude,
          ),
        );

        setRoute({
          active: true,
          wgs84Path: response.path,
          arPath,
          distanceRemaining: response.distanceMeters,
          targetName: anchor.name,
          isLoading: false,
        });
      } catch (err) {
        console.warn('[AR Navigation] Erro ao calcular rota:', err);
        setRoute(EMPTY_ROUTE);
      }
    },
    [userCoordsRef, referenceHeadingRef, projectionOrigin],
  );

  /** Encerra a navegação. */
  const stopNavigation = useCallback(() => {
    setRoute(EMPTY_ROUTE);
  }, []);

  /** Atualiza a distância restante com base na posição atual do usuário. */
  const updateDistance = useCallback(
    (userLat: number, userLng: number) => {
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
    },
    [],
  );

  return { route, startNavigation, stopNavigation, updateDistance };
}
