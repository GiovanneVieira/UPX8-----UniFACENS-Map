import { z, type Category } from 'shared';
import { getApiBaseUrl } from '@/services/api';
import { getTeamAuthorization } from '@/services/team-authorization';
import { useAuthStore } from '@/stores/use-auth-store';

const categoriesSchema = z.array(z.custom<Category>());

/**
 * Busca as categorias (com modelo 3D vinculado) — alimenta filtros, formulários
 * e o seletor de categoria do pin AR. Qualquer sessão autenticada lê.
 */
export async function fetchCategories(signal?: AbortSignal): Promise<Category[]> {
  const response = await fetch(`${getApiBaseUrl()}/categories`, {
    headers: { Accept: 'application/json', ...getTeamAuthorization() },
    signal,
  });
  if (response.status === 401) {
    useAuthStore.getState().clearSession();
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  if (!response.ok) {
    throw new Error('Não foi possível carregar as categorias. Tente novamente.');
  }
  return categoriesSchema.parse(await response.json());
}
