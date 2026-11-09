import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { anchorSchema, z, type Anchor, type CreateAnchorDto, type UpdateAnchorDto } from 'shared';
import { getTeamAuthorization } from './team-authorization';
import { useAuthStore } from '@/stores/use-auth-store';

/** Timeout padrão das chamadas à API (ms) — evita fetch pendurado eternamente. */
const API_TIMEOUT_MS = 8000;

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

const deleteResultSchema = z.object({ success: z.boolean() });

function friendlyStatusError(status: number): string {
  if (status === 400) return 'Dados inválidos. Revise as informações enviadas.';
  if (status === 401) return 'Acesso não autorizado. Valide o acesso da equipe.';
  if (status === 404) return 'Recurso não encontrado.';
  if (status >= 500) return 'Erro interno do servidor. Tente novamente em instantes.';
  return 'Não foi possível concluir a operação.';
}

/**
 * Fetch com timeout, Bearer JWT (todas as rotas exigem autenticação) e
 * validação Zod da resposta (Single Source of Truth em `shared`).
 * Erros são sempre amigáveis ao usuário; detalhes técnicos ficam no console.
 */
async function request<T>(url: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...getTeamAuthorization(),
        ...init.headers,
      },
      signal: controller.signal,
    });
  } catch (err) {
    console.warn(`[api] Falha de rede em ${url}:`, err);
    throw new Error('Não foi possível falar com o servidor. Confira a conexão e tente novamente.');
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401) {
    // Sessão inválida/expirada: o AuthGate retorna à tela de login.
    useAuthStore.getState().clearSession();
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.warn(`[api] HTTP ${response.status} em ${url}: ${detail}`);
    throw new Error(friendlyStatusError(response.status));
  }

  return schema.parse(await response.json());
}

/**
 * Busca todas as âncoras geodésicas cadastradas.
 */
export async function fetchAnchors(): Promise<Anchor[]> {
  return request(`${getApiBaseUrl()}/anchors`, z.array(anchorSchema), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
}

/**
 * Busca uma âncora específica por ID.
 */
export async function fetchAnchorById(id: string): Promise<Anchor> {
  return request(`${getApiBaseUrl()}/anchors/${id}`, anchorSchema, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
}

/**
 * Cria uma nova âncora geodésica (coordenada real projetada no espaço AR).
 */
export async function createAnchor(data: CreateAnchorDto): Promise<Anchor> {
  return request(`${getApiBaseUrl()}/anchors`, anchorSchema, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getTeamAuthorization(),
      Accept: 'application/json',
    },
    body: JSON.stringify(data),
  });
}

/**
 * Vincula a âncora visual hospedada (Cloud Anchor real + offset no frame).
 */
export async function patchAnchor(
  id: string,
  data: UpdateAnchorDto,
): Promise<Anchor> {
  return request(`${getApiBaseUrl()}/anchors/${id}`, anchorSchema, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getTeamAuthorization(),
      Accept: 'application/json',
    },
    body: JSON.stringify(data),
  });
}

/**
 * Exclui uma âncora do catálogo por ID.
 */
export async function deleteAnchor(id: string): Promise<{ success: boolean }> {
  return request(`${getApiBaseUrl()}/anchors/${id}`, deleteResultSchema, {
    method: 'DELETE',
    headers: {
      ...getTeamAuthorization(),
      Accept: 'application/json',
    },
  });
}
