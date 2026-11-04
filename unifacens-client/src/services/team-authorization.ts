import { useAuthStore } from '@/stores/use-auth-store';

/**
 * Header de autorização para mutations protegidas.
 * O JWT é mantido em memória (store) e persistido no secret-storage
 * do dispositivo (nativo) — nunca em EXPO_PUBLIC_ nem em logs.
 */
export function getTeamAuthorization(): Record<string, string> {
  const token = useAuthStore.getState().jwt;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
