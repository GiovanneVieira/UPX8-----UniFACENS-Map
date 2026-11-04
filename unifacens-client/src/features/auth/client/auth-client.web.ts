import { createAuthClient } from 'better-auth/react';
import { getApiBaseUrl } from '@/services/api';

export const JWT_STORAGE_KEY = 'unifacens.jwt';

/**
 * Client better-auth para web: a sessão persiste em cookie (same-origin),
 * sem secret-storage. O JWT é mantido apenas em memória durante a sessão.
 */
export const authClient = createAuthClient({
  baseURL: getApiBaseUrl(),
  basePath: '/auth',
});

export async function saveJwt(_token: string): Promise<void> {
  /* web: persistência via cookie de sessão do better-auth */
}

export async function loadJwt(): Promise<string | null> {
  return null;
}

export async function clearJwt(): Promise<void> {
  /* web: signOut do better-auth limpa o cookie */
}
