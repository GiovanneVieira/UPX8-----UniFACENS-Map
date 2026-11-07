import { withRequestTimeout } from '@/services/request-timeout';
import type { RouteResponse } from 'shared';
import { getApiBaseUrl } from '@/services/api';
import { getTeamAuthorization } from '@/services/team-authorization';

/**
 * Chama o serviço de rota pedestrian (POST /routing/route) no backend.
 * Requer Bearer JWT (todas as rotas exigem autenticação).
 */
export async function requestRoute(
  origin: { latitude: number; longitude: number },
  target: { anchorId: string } | { latitude: number; longitude: number },
  signal?: AbortSignal,
): Promise<RouteResponse> {
  return withRequestTimeout(async (requestSignal) => {
    const response = await fetch(`${getApiBaseUrl()}/routing/route`, {
      signal: requestSignal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...getTeamAuthorization(),
      },
      body: JSON.stringify({ origin, target }),
    });

    if (response.status === 401) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.warn(`[routing] HTTP ${response.status}: ${detail}`);
      throw new Error('Não foi possível calcular a rota.');
    }

    return response.json() as Promise<RouteResponse>;
  }, signal);
}
