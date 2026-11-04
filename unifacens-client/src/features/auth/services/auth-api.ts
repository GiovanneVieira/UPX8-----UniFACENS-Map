import { accessPolicySchema, adminSessionSchema } from 'shared';
import { getApiBaseUrl } from '@/services/api';

export async function fetchAccessPolicy(signal: AbortSignal) {
  const response = await fetch(`${getApiBaseUrl()}/access`, { signal });
  if (!response.ok)
    throw new Error('Não foi possível consultar as permissões.');
  return accessPolicySchema.parse(await response.json());
}

/**
 * Valida o JWT de administrador no backend (GET /access/session).
 * Retorna 401/403 para tokens inválidos, expirados ou de role comum.
 */
export async function fetchAdminSession(jwt: string, signal?: AbortSignal) {
  const response = await fetch(`${getApiBaseUrl()}/access/session`, {
    headers: { Authorization: `Bearer ${jwt}` },
    signal,
  });
  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403
        ? 'Sessão de administrador inválida ou expirada.'
        : 'Não foi possível validar a sessão.',
    );
  }
  return adminSessionSchema.parse(await response.json());
}
