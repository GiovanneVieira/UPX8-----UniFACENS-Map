import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';
import { getApiBaseUrl } from '@/services/api';

/**
 * Chave do JWT no secret-storage do dispositivo (Android Keystore / iOS Keychain).
 * O token é enviado como `Authorization: Bearer` nas mutations protegidas.
 */
export const JWT_STORAGE_KEY = 'unifacens.jwt';

/**
 * Client better-auth para nativo (Android/iOS):
 * - `expoClient` persiste os cookies de sessão no expo-secure-store,
 *   dando suporte ao refresh silencioso do JWT (24h) sem re-login;
 * - O JWT é obtido em `GET /auth/token` via `authClient.$fetch`
 *   (os cookies de sessão são anexados automaticamente).
 */
export const authClient = createAuthClient({
  baseURL: getApiBaseUrl(),
  // O handler better-auth da API é montado em /auth (ver better-auth.ts no
  // servidor); sem isto o client chamaria o default /api/auth → 404.
  basePath: '/auth',
  // ⚠️ WEB (bug do merge, 2026-11-09): sem credentials:'include' o navegador
  // DESCARTA o Set-Cookie da resposta do login em requisições cross-origin
  // (app :8081 → API :8000 = origens diferentes por PORTA) — o signIn
  // "succeede", mas o cookie de sessão nunca é armazenado e o GET /auth/token
  // sai sem cookie → 401 → "Não foi possível obter o token de acesso".
  // No nativo é inócuo (o expoClient gerencia cookies via SecureStore).
  fetchOptions: {
    credentials: 'include',
  },
  plugins: [
    expoClient({
      scheme: 'unifacensclient',
      storagePrefix: 'unifacens',
      storage: SecureStore,
    }),
  ],
});

export async function saveJwt(token: string): Promise<void> {
  await SecureStore.setItemAsync(JWT_STORAGE_KEY, token);
}

export async function loadJwt(): Promise<string | null> {
  return SecureStore.getItemAsync(JWT_STORAGE_KEY);
}

export async function clearJwt(): Promise<void> {
  await SecureStore.deleteItemAsync(JWT_STORAGE_KEY);
}
