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
        // Usa a posição CALIBRADA (não GPS bruto) como origem. Se estiver
        // muito longe do campus (>1km, ex: testando de casa), usa o centro
        // do campus como fallback para permitir navegação remota.
        const CAMPUS_CENTER = { latitude: -23.4699, longitude: -47.4297 };
        const originCoords = projectionOrigin();
        let origin = { latitude: originCoords.latitude, longitude: originCoords.longitude };

        const distFromCampus = Math.hypot(
          (origin.latitude - CAMPUS_CENTER.latitude) * 111000,
          (origin.longitude - CAMPUS_CENTER.longitude) * 111000 * Math.cos((origin.latitude * Math.PI) / 180),
        );
        if (distFromCampus > 1000) {
          console.log('[AR Nav] Origem fora do campus (' + Math.round(distFromCampus) + 'm) — usando centro do campus como fallback');
          origin = CAMPUS_CENTER;
        }

        console.log('[AR Nav] origin:', JSON.stringify({ lat: origin.latitude.toFixed(6), lng: origin.longitude.toFixed(6) }));
        console.log('[AR Nav] target:', JSON.stringify({ id: anchor.id, name: anchor.name, lat: anchor.latitude, lng: anchor.longitude }));

        const response = await requestRoute(
          { latitude: origin.latitude, longitude: origin.longitude },
          { anchorId: anchor.id },
        );

        console.log('[AR Nav] ROTA OK:', JSON.stringify({ pts: response.path.length, dist: response.distanceMeters, segs: response.segments.length }));
        console.log('[AR Nav] path[0]:', JSON.stringify(response.path[0]));
        console.log('[AR Nav] path[last]:', JSON.stringify(response.path[response.path.length - 1]));

        // Projeta cada waypoint WGS84 → AR local usando a MESMA origem da rota
        const heading = referenceHeadingRef.current ?? 0;
        const projOrigin = projectionOrigin();
        // Se origin foi fallback para campus center, usa campus center na projeção também
        const projLat = distFromCampus > 1000 ? origin.latitude : projOrigin.latitude;
        const projLng = distFromCampus > 1000 ? origin.longitude : projOrigin.longitude;

        const arPath: Array<[number, number, number]> = response.path.map((point) =>
          calculateRelativeARPosition(
            projLat,
            projLng,
            projOrigin.altitude,
            heading,
            point.latitude,
            point.longitude,
            projOrigin.altitude,
          ),
        );

        console.log('[AR Nav] AR path[0]:', JSON.stringify(arPath[0]?.map((v) => Number(v.toFixed(2)))));
        console.log('[AR Nav] AR path[last]:', JSON.stringify(arPath[arPath.length - 1]?.map((v) => Number(v.toFixed(2)))));

        setRoute({
          active: true,
          wgs84Path: response.path,
          arPath,
          distanceRemaining: response.distanceMeters,
          targetName: anchor.name,
          isLoading: false,
        });
      } catch (err) {
        console.warn('[AR Nav] ERRO:', err instanceof Error ? err.message : String(err));
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
