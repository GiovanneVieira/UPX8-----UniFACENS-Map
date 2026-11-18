import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

export interface UserCoords {
  latitude: number;
  longitude: number;
}

/** Distância aproximada entre dois pontos WGS84 (haversine, metros). */
export function haversineMeters(
  from: UserCoords,
  to: { latitude: number; longitude: number },
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(to.latitude - from.latitude);
  const dLng = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Posição aproximada do usuário para distâncias no mapa do campus:
 * pergunta a permissão e faz UMA leitura de GPS (sem subscrição contínua —
 * o AR tem o useARGeolocation para isso). Sem permissão/GPS → null e a
 * distância simplesmente não é exibida (feedback honesto).
 *
 * Efeito de sincronização com sensor de hardware (caso legítimo de
 * `useEffect` conforme AGENTS.MD §7), com cleanup de cancelamento.
 */
export function useUserLocation(): UserCoords | null {
  const [coords, setCoords] = useState<UserCoords | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted || cancelled) return;
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      } catch {
        // Sem GPS (indoor/permissão negada) — distância fica oculta.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return coords;
}
