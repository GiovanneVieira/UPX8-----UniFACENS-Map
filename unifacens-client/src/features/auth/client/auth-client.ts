import { Platform } from 'react-native';
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
 * ⚠️ expoClient SOMENTE em nativo (bug web, 2026-11-09): o plugin substitui
 * o fetch por um adapter de cookies via SecureStore — no navegador ele
 * ENGOLE o Set-Cookie do login (SecureStore não existe na web) e a sessão
 * nunca persiste → getSession sem usuário → "Não foi possível concluir o
 * acesso". Na web, o browser cuida dos cookies nativamente (com o
 * credentials:'include' abaixo).
 */
const authPlugins =
  Platform.OS === 'web'
    ? []
    : [
        expoClient({
          scheme: 'unifacensclient',
          storagePrefix: 'unifacens',
          storage: SecureStore,
        }),
      ];

/**
 * Client better-auth:
 * - NATIVO: `expoClient` persiste os cookies de sessão no expo-secure-store
 *   (refresh silencioso do JWT de 24h sem re-login);
 * - WEB: cookies do navegador (exige credentials:'include' — sem isto o
 *   navegador descarta o Set-Cookie do login em requisições cross-origin).
 * - O JWT é obtido em `GET /auth/token` via `authClient.$fetch`.
 */
export const authClient = createAuthClient({
  baseURL: getApiBaseUrl(),
  // O handler better-auth da API é montado em /auth (ver better-auth.ts no
  // servidor); sem isto o client chamaria o default /api/auth → 404.
  basePath: '/auth',
  fetchOptions: {
    credentials: 'include',
  },
  plugins: authPlugins,
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
