import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import {
  CAMPUS_DATUM_ALTITUDE_M,
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
  altitude: CAMPUS_DATUM_ALTITUDE_M,
  accuracy: 10,
};

/** Acurácia máxima aceita para uma fix de GPS (fixes piores são descartadas). */
const MAX_GPS_ACCURACY_M = 20;

/**
 * Altitude de GPS embutida é notoriamente ruidosa (±30m+). O campus é plano
 * (~605m): discrepâncias grandes usam o datum em vez do valor do sensor.
 */
function sanitizeAltitude(altitude?: number | null): number {
  if (
    typeof altitude === 'number' &&
    Number.isFinite(altitude) &&
    Math.abs(altitude - CAMPUS_DATUM_ALTITUDE_M) <= 50
  ) {
    return altitude;
  }
  return CAMPUS_DATUM_ALTITUDE_M;
}

/**
 * Subscrições contínuas de GPS e bússola com compensação de declinação
 * magnética de Sorocaba/SP (-21.3° Oeste) e filtro passa-baixa circular
 * (alpha = 0.15) para eliminação de jitter na transição 0° <-> 360°.
 *
 * Gating de qualidade: fixes com acurácia pior que MAX_GPS_ACCURACY_M são
 * descartadas, e `hasFix`/`hasHeading` sinalizam a existência da primeira
 * leitura confiável de cada sensor (consumidos pelo World Anchor).
 *
 * Efeito de sincronização com sensores de hardware (caso legítimo de
 * `useEffect` conforme AGENTS.MD §7), com cleanup obrigatório.
 */
export function useARGeolocation() {
  const userCoordsRef = useRef<GeoCoords>(DEFAULT_CAMPUS_COORDS);
  const [userCoords, setUserCoords] = useState<GeoCoords>(userCoordsRef.current);
  const [hasFix, setHasFix] = useState(false);
  const hasFixRef = useRef(false);

  const compassFilterRef = useRef<CircularLowPassFilter>(new CircularLowPassFilter(0.15));
  const userTrueHeadingRef = useRef<number>(0);
  const [userTrueHeading, setUserTrueHeading] = useState<number>(0);
  const [hasHeading, setHasHeading] = useState(false);
  const hasHeadingRef = useRef(false);

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

        // 1. Posição inicial rápida (última conhecida) — só se confiável
        const initialLoc = await Location.getLastKnownPositionAsync({});
        const initialAccuracy = initialLoc?.coords.accuracy ?? Number.POSITIVE_INFINITY;
        if (initialLoc && initialAccuracy <= MAX_GPS_ACCURACY_M && isMounted) {
          const coords: GeoCoords = {
            latitude: initialLoc.coords.latitude,
            longitude: initialLoc.coords.longitude,
            altitude: sanitizeAltitude(initialLoc.coords.altitude),
            accuracy: initialLoc.coords.accuracy ?? 10,
          };
          userCoordsRef.current = coords;
          setUserCoords(coords);
          hasFixRef.current = true;
          setHasFix(true);
        }

        // 2. Rastreamento contínuo de posição GPS (com gating de acurácia)
        posSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 5,
            timeInterval: 2000,
          },
          (loc) => {
            if (!isMounted) return;
            const accuracy = loc.coords.accuracy ?? Number.POSITIVE_INFINITY;
            if (accuracy > MAX_GPS_ACCURACY_M) return; // fix ruim: mantém a última boa

            const coords: GeoCoords = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              altitude: sanitizeAltitude(loc.coords.altitude),
              accuracy: loc.coords.accuracy ?? 10,
            };
            userCoordsRef.current = coords;
            setUserCoords(coords);
            if (!hasFixRef.current) {
              hasFixRef.current = true;
              setHasFix(true);
            }
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
          if (!hasHeadingRef.current) {
            hasHeadingRef.current = true;
            setHasHeading(true);
          }
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

  return {
    userCoords,
    userCoordsRef,
    hasFix,
    userTrueHeading,
    userTrueHeadingRef,
    hasHeading,
    hasHeadingRef,
  };
}
