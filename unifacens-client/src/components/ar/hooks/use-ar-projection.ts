import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type Anchor,
  calculateDistance,
  calculateRelativeARPosition,
} from 'shared';
import type { CampusLandmark } from '@/constants/campus-landmarks';
import type { GeoCoords } from './use-ar-geolocation';

/** Deslocamento mínimo (m) antes de re-projetar âncoras por GPS (modo outdoor). */
const REPROJECTION_THRESHOLD_M = 15;

interface UseARProjectionParams {
  /** Âncoras vindas do server state (TanStack Query). */
  serverAnchors: Anchor[] | undefined;
  /** Sensores de geolocalização (GPS + bússola compensada). */
  geo: {
    userCoords: GeoCoords;
    userCoordsRef: React.MutableRefObject<GeoCoords>;
    userTrueHeading: number;
    userTrueHeadingRef: React.MutableRefObject<number>;
  };
}

/**
 * Motor Geodésico do container AR: projeta âncoras WGS84 no frustum local
 * (ENU rotacionado pelo Norte Verdadeiro), gerencia a Calibração Zero-Marker
 * e o cache de posições travadas na sessão (pontos criados pelo usuário que
 * jamais devem ser recalculados — rigidez SLAM absoluta).
 */
export function useARProjection({ serverAnchors, geo }: UseARProjectionParams) {
  const rawAnchorsRef = useRef<Anchor[]>([]);
  const [anchors, setAnchors] = useState<Anchor[]>([]);

  // Cache de posições travadas na sessão atual
  const sessionLockedPositionsRef = useRef<Map<string, [number, number, number]>>(new Map());

  // Calibração Zero-Marker (pinpoint em marco conhecido do campus)
  const [calibratedLandmark, setCalibratedLandmark] = useState<CampusLandmark | null>(null);
  const calibratedLandmarkRef = useRef<CampusLandmark | null>(null);

  // Orientação/coords de referência da projeção (imutáveis até recalibrar)
  const referenceHeadingRef = useRef<number | null>(null);
  const lastProjectedCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);

  const updateProjectedAnchors = useCallback(
    (
      sourceAnchors: Anchor[],
      coords: { latitude: number; longitude: number; altitude: number },
      heading: number,
      calibrated: CampusLandmark | null,
    ) => {
      const activeLat = calibrated ? calibrated.latitude : coords.latitude;
      const activeLon = calibrated ? calibrated.longitude : coords.longitude;
      const activeAlt = calibrated ? calibrated.altitude : coords.altitude;

      const projected: Anchor[] = sourceAnchors.map((anchor) => {
        // 1. Âncora criada/travada nesta sessão: preserva a pose SLAM exata
        if (sessionLockedPositionsRef.current.has(anchor.id)) {
          const lockedPos = sessionLockedPositionsRef.current.get(anchor.id)!;
          return {
            ...anchor,
            arPosition: lockedPos,
            distanceMeters:
              anchor.distanceMeters ?? Math.hypot(lockedPos[0], lockedPos[1], lockedPos[2]),
          };
        }

        // 2. Projeta âncoras conhecidas em relação à origem ativa
        if (
          typeof anchor.latitude === 'number' &&
          Number.isFinite(anchor.latitude) &&
          typeof anchor.longitude === 'number' &&
          Number.isFinite(anchor.longitude)
        ) {
          const targetAlt =
            typeof anchor.altitude === 'number' && Number.isFinite(anchor.altitude)
              ? anchor.altitude
              : activeAlt;

          const distanceMeters = calculateDistance(
            activeLat,
            activeLon,
            anchor.latitude,
            anchor.longitude,
          );

          // O próprio marco de calibração fica à frente, na altura dos olhos
          if (
            calibrated &&
            Math.abs(anchor.latitude - calibrated.latitude) < 0.00002 &&
            Math.abs(anchor.longitude - calibrated.longitude) < 0.00002
          ) {
            return {
              ...anchor,
              distanceMeters: 0,
              arPosition: [0, 0, -1.2] as [number, number, number],
            };
          }

          const arPos = calculateRelativeARPosition(
            activeLat,
            activeLon,
            activeAlt,
            heading,
            anchor.latitude,
            anchor.longitude,
            targetAlt,
          );

          return { ...anchor, distanceMeters, arPosition: arPos };
        }

        return anchor;
      });

      setAnchors(projected);
    },
    [],
  );

  // Sincronização do server state (TanStack Query) com o motor de projeção.
  // Efeito legítimo (§7): sincroniza com fonte externa quando `data` muda.
  useEffect(() => {
    if (!serverAnchors) return;
    rawAnchorsRef.current = serverAnchors;
    const headingToUse = referenceHeadingRef.current ?? geo.userTrueHeadingRef.current;
    updateProjectedAnchors(
      serverAnchors,
      geo.userCoordsRef.current,
      headingToUse,
      calibratedLandmarkRef.current,
    );
  }, [serverAnchors, updateProjectedAnchors, geo.userCoordsRef, geo.userTrueHeadingRef]);

  // Inicializa a orientação de referência na primeira leitura válida da bússola
  useEffect(() => {
    if (referenceHeadingRef.current !== null || geo.userTrueHeading === 0) return;
    const heading = geo.userTrueHeadingRef.current;
    if (heading === 0) return;
    referenceHeadingRef.current = heading;
    updateProjectedAnchors(
      rawAnchorsRef.current,
      geo.userCoordsRef.current,
      heading,
      calibratedLandmarkRef.current,
    );
  }, [geo.userTrueHeading, geo.userTrueHeadingRef, geo.userCoordsRef, updateProjectedAnchors]);

  // Política outdoor: re-projeta somente quando NÃO calibrado e o deslocamento
  // acumulado desde a última projeção ultrapassa o limiar (evita churn de nós 3D)
  useEffect(() => {
    if (calibratedLandmarkRef.current) return;
    const newCoords = geo.userCoords;
    if (!lastProjectedCoordsRef.current) {
      lastProjectedCoordsRef.current = newCoords;
      return;
    }
    const movedDist = calculateDistance(
      lastProjectedCoordsRef.current.latitude,
      lastProjectedCoordsRef.current.longitude,
      newCoords.latitude,
      newCoords.longitude,
    );
    if (movedDist > REPROJECTION_THRESHOLD_M) {
      lastProjectedCoordsRef.current = newCoords;
      updateProjectedAnchors(
        rawAnchorsRef.current,
        newCoords,
        referenceHeadingRef.current ?? geo.userTrueHeadingRef.current,
        null,
      );
    }
  }, [geo.userCoords, geo.userTrueHeadingRef, updateProjectedAnchors]);

  /** Calibra em um marco conhecido (ou restaura o GPS passando `null`). */
  const calibrate = useCallback(
    (landmark: CampusLandmark | null) => {
      setCalibratedLandmark(landmark);
      calibratedLandmarkRef.current = landmark;
      referenceHeadingRef.current = geo.userTrueHeadingRef.current;
      lastProjectedCoordsRef.current = geo.userCoordsRef.current;
      updateProjectedAnchors(
        rawAnchorsRef.current,
        geo.userCoordsRef.current,
        geo.userTrueHeadingRef.current,
        landmark,
      );
    },
    [geo.userCoordsRef, geo.userTrueHeadingRef, updateProjectedAnchors],
  );

  /** Trava rigidamente a posição 3D de uma âncora nesta sessão (SLAM puro). */
  const lockPosition = useCallback((id: string, position: [number, number, number]) => {
    sessionLockedPositionsRef.current.set(id, position);
  }, []);

  /** Remove o travamento de sessão e a âncora das listas locais. */
  const removeAnchorLocal = useCallback(
    (id: string) => {
      sessionLockedPositionsRef.current.delete(id);
      const remaining = rawAnchorsRef.current.filter((a) => a.id !== id);
      rawAnchorsRef.current = remaining;
      updateProjectedAnchors(
        remaining,
        geo.userCoordsRef.current,
        geo.userTrueHeadingRef.current,
        calibratedLandmarkRef.current,
      );
    },
    [geo.userCoordsRef, geo.userTrueHeadingRef, updateProjectedAnchors],
  );

  /** Adiciona uma âncora recém-criada à lista bruta local (exibição imediata). */
  const prependAnchor = useCallback((anchor: Anchor) => {
    rawAnchorsRef.current = [anchor, ...rawAnchorsRef.current];
  }, []);

  return {
    anchors,
    updateProjectedAnchors,
    calibratedLandmark,
    calibrate,
    lockPosition,
    removeAnchorLocal,
    prependAnchor,
  };
}
