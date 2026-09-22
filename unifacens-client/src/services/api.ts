import { Platform } from 'react-native';
import type { Anchor, CreateAnchorDto } from 'shared';

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

  // Mobile (Android emulator usa 10.0.2.2, dispositivo físico usa localhost via adb reverse ou IP da LAN)
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
    },
  });

  if (!res.ok) {
    throw new Error(`Erro ao excluir âncora (${res.status}): ${await res.text()}`);
  }

  return res.json();
}
