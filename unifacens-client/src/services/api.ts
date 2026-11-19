import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { File } from 'expo-file-system';
import { anchorSchema, z, type Anchor, type CreateAnchorDto, type UpdateAnchorDto } from 'shared';
import { getTeamAuthorization } from './team-authorization';
import { useAuthStore } from '@/stores/use-auth-store';

/** Timeout padrão das chamadas à API (ms) — evita fetch pendurado eternamente. */
const API_TIMEOUT_MS = 8000;
/** Janela maior para upload multipart de fotos (várias MB via adb/wifi). */
const UPLOAD_TIMEOUT_MS = 45_000;

export function getApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');
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
 * Resolve uma URL de asset devolvida pela API: absolutas (S3 público) passam
 * direto; relativas (/uploads/... do adapter local de dev) ganham a origem
 * da API que o dispositivo já alcança.
 */
export function resolveAssetUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${getApiBaseUrl()}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
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
 *
 * `timeoutMs`: uploads multipart de fotos precisam de janela maior que o
 * default de 8s (lição de device 2026-11-16: AbortError aos 8s virava
 * "Não foi possível falar com o servidor" enganosamente).
 */
async function request<T>(
  url: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
  timeoutMs: number = API_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

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

/** Resposta dos endpoints de imagens do ponto. */
const imageResultSchema = z.object({ images: z.array(z.string()) });

/**
 * Envia a fila de fotos do ponto NA ORDEM (multipart — o servidor grava a
 * sequência do FormData no JSONB).
 *
 * ⚠️ Expo SDK 57 "winter" fetch (lição de device 2026-11-16): partes com
 * `uri` NÃO são suportadas ("uri is not supported for React Native's
 * FormData" — convertFormData.ts) — o conversor aceita apenas string |
 * Blob | objeto com `bytes()`. O `File` do expo-file-system implementa a
 * interface (`bytes(): Promise<Uint8Array>`); envolvemos num objeto com
 * name/type EXPLÍCITOS porque o File não expõe `type` (sem content-type o
 * multer leria application/octet-stream → 400 "Tipo não suportado").
 */
export async function uploadAnchorImages(
  id: string,
  photos: Array<{ uri: string; fileName: string; mime: string }>,
): Promise<{ images: string[] }> {
  const body = new FormData();
  for (const photo of photos) {
    const file = new File(photo.uri);
    body.append('files', {
      name: photo.fileName,
      type: photo.mime,
      bytes: () => file.bytes(),
    } as unknown as Blob);
  }
  return request(`${getApiBaseUrl()}/anchors/${id}/images`, imageResultSchema, {
    method: 'POST',
    headers: {
      ...getTeamAuthorization(),
      Accept: 'application/json',
    },
    body,
  }, UPLOAD_TIMEOUT_MS);
}

/**
 * Exclui uma imagem do ponto (aceita URL resolvida ou chave — o servidor
 * normaliza via storage.keyFor).
 */
export async function deleteAnchorImage(
  id: string,
  keyOrUrl: string,
): Promise<{ images: string[] }> {
  return request(
    `${getApiBaseUrl()}/anchors/${id}/images?key=${encodeURIComponent(keyOrUrl)}`,
    imageResultSchema,
    {
      method: 'DELETE',
      headers: {
        ...getTeamAuthorization(),
        Accept: 'application/json',
      },
    },
  );
}

/** Resposta dos endpoints de avatar do usuário. */
const avatarResultSchema = z.object({ image: z.string().nullable() });

/**
 * Envia a foto de perfil (multipart, mesma técnica do upload de fotos do
 * ponto — File do expo-file-system com bytes()/name/type explícitos).
 */
export async function uploadUserAvatar(photo: {
  uri: string;
  fileName: string;
  mime: string;
}): Promise<{ image: string | null }> {
  const body = new FormData();
  const file = new File(photo.uri);
  body.append('file', {
    name: photo.fileName,
    type: photo.mime,
    bytes: () => file.bytes(),
  } as unknown as Blob);
  return request(`${getApiBaseUrl()}/users/me/avatar`, avatarResultSchema, {
    method: 'POST',
    headers: {
      ...getTeamAuthorization(),
      Accept: 'application/json',
    },
    body,
  }, UPLOAD_TIMEOUT_MS);
}

/** Remove a foto de perfil do usuário autenticado. */
export async function removeUserAvatar(): Promise<{ image: string | null }> {
  return request(`${getApiBaseUrl()}/users/me/avatar`, avatarResultSchema, {
    method: 'DELETE',
  });
}
