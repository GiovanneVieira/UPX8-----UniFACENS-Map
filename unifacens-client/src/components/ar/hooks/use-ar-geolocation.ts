import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import {
  CircularLowPassFilter,
  SOROCABA_MAGNETIC_DECLINATION,
  magneticToTrueHeading,
} from 'shared';

export interface GeoCoords {
  latitude: number;
  longitude: number;
  altitude: number;
  accuracy: number;
}

const DEFAULT_CAMPUS_COORDS: GeoCoords = {
  latitude: -23.4699,
  longitude: -47.4297,
  altitude: 605,
  accuracy: 10,
};

/**
 * Subscrições contínuas de GPS e bússola com compensação de declinação
 * magnética de Sorocaba/SP (-21.3° Oeste) e filtro passa-baixa circular
 * (alpha = 0.15) para eliminação de jitter na transição 0° <-> 360°.
 *
 * Efeito de sincronização com sensores de hardware (caso legítimo de
 * `useEffect` conforme AGENTS.MD §7), com cleanup obrigatório.
 */
export function useARGeolocation() {
  const hasLocationRef = useRef(false);
  const userCoordsRef = useRef<GeoCoords>(DEFAULT_CAMPUS_COORDS);
  const [userCoords, setUserCoords] = useState<GeoCoords>(userCoordsRef.current);

  const compassFilterRef = useRef<CircularLowPassFilter>(new CircularLowPassFilter(0.15));
  const userTrueHeadingRef = useRef<number>(0);
  const [userTrueHeading, setUserTrueHeading] = useState<number>(0);

  useEffect(() => {
    let isMounted = true;
    let posSub: Location.LocationSubscription | null = null;
    let headingSub: Location.LocationSubscription | null = null;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.warn('[useARGeolocation] Permissão de localização não concedida');
          return;
        }

        // 1. Posição inicial rápida (última conhecida)
        const initialLoc = await Location.getLastKnownPositionAsync({ maxAge: 30000 });
        if (initialLoc && isMounted) {
          const coords: GeoCoords = {
            latitude: initialLoc.coords.latitude,
            longitude: initialLoc.coords.longitude,
            altitude: initialLoc.coords.altitude ?? 605,
            accuracy: initialLoc.coords.accuracy ?? 10,
          };
          userCoordsRef.current = coords;
          hasLocationRef.current = true;
          setUserCoords(coords);
        }

        // 2. Rastreamento contínuo de posição GPS
        posSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 5,
            timeInterval: 2000,
          },
          (loc) => {
            if (!isMounted) return;
            const coords: GeoCoords = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              altitude: loc.coords.altitude ?? 605,
              accuracy: loc.coords.accuracy ?? 10,
            };
            userCoordsRef.current = coords;
            hasLocationRef.current = true;
            setUserCoords(coords);
          },
        );

        // 3. Bússola contínua para orientação do HUD e heading de projeção
        headingSub = await Location.watchHeadingAsync((headingData) => {
          if (!isMounted) return;
          const rawMag =
            typeof headingData.magHeading === 'number' &&
            Number.isFinite(headingData.magHeading) &&
            headingData.magHeading >= 0
              ? headingData.magHeading
              : (headingData.trueHeading ?? 0);

          const filteredMag = compassFilterRef.current.update(rawMag);
          const trueHeading = magneticToTrueHeading(filteredMag, SOROCABA_MAGNETIC_DECLINATION);
          userTrueHeadingRef.current = trueHeading;
          setUserTrueHeading(Math.round(trueHeading));
        });
      } catch (sensorErr) {
        console.warn('[useARGeolocation] Erro nos sensores:', sensorErr);
      }
    })();

    return () => {
      isMounted = false;
      posSub?.remove();
      headingSub?.remove();
    };
  }, []);

  return { userCoords, userCoordsRef, userTrueHeading, userTrueHeadingRef, hasLocationRef };
}
