import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { Anchor, CreateAnchorDto } from 'shared';
import { getTeamAuthorization } from './team-authorization';

export function getApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.hostname) {
      return `http://${window.location.hostname}:8000`;
    }
    // SSR dentro do container client: aponta para o container da API
    return process.env.INTERNAL_API_URL || 'http://api:8000';
  }

  // Tenta extrair o IP do host a partir do Metro Bundler (Constants.expoConfig?.hostUri)
  // Exemplo: hostUri = "192.168.3.2:8081" -> ip = "192.168.3.2"
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
      return `http://${ip}:8000`;
    }
  }

  // Mobile fallback (se via USB com adb reverse ou emulador)
  return 'http://localhost:8000';
}

/**
 * Busca todas as âncoras na nuvem (Google ARCore Cloud Anchors) cadastradas.
 */
export async function fetchAnchors(): Promise<Anchor[]> {
  const url = `${getApiBaseUrl()}/anchors`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Erro ao buscar âncoras (${res.status}): ${await res.text()}`);
  }

  return res.json();
}

/**
 * Busca uma âncora específica por ID.
 */
export async function fetchAnchorById(id: string): Promise<Anchor> {
  const url = `${getApiBaseUrl()}/anchors/${id}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Erro ao buscar âncora (${res.status}): ${await res.text()}`);
  }

  return res.json();
}

/**
 * Cria uma nova âncora vinculada a um Cloud Anchor ID gerado pelo Google ARCore.
 */
export async function createAnchor(data: CreateAnchorDto): Promise<Anchor> {
  const url = `${getApiBaseUrl()}/anchors`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getTeamAuthorization(),
      Accept: 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(`Erro ao criar âncora (${res.status}): ${await res.text()}`);
  }

  return res.json();
}

/**
 * Exclui uma âncora do catálogo por ID.
 */
export async function deleteAnchor(id: string): Promise<{ success: boolean }> {
  const url = `${getApiBaseUrl()}/anchors/${id}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      ...getTeamAuthorization(),
    },
  });

  if (!res.ok) {
    throw new Error(`Erro ao excluir âncora (${res.status}): ${await res.text()}`);
  }

  return res.json();
}
