import {
  z,
  navigationNetworksPageSchema,
  navigationNetworkVersionSchema,
  navigationRequestSchema,
  navigationResultSchema,
  navigationAnchorRequestSchema,
  navigationAnchorResultSchema,
  type NavigationAnchorRequest,
  type NavigationNetworkParams,
  type NavigationRequest,
} from "shared";
import { getApiBaseUrl } from "@/services/api";
import { getTeamAuthorization } from "@/services/team-authorization";
import { useAuthStore } from "@/stores/use-auth-store";

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  init.signal?.addEventListener("abort", abort, { once: true });
  if (init.signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 12000);
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/navigation/networks${path}`,
      {
        ...init,
        headers: {
          Accept: "application/json",
          ...getTeamAuthorization(),
          ...init.headers,
        },
        signal: controller.signal,
      },
    );
    if (response.status === 401) {
      useAuthStore.getState().clearSession();
      throw new Error("Sessão expirada. Entre novamente.");
    }
    if (response.status === 404 || response.status === 409)
      throw new Error(
        "Estes percursos foram atualizados ou estão indisponíveis. Atualize as áreas e selecione novamente.",
      );
    if (!response.ok)
      throw new Error(
        "Não foi possível consultar os percursos. Tente novamente.",
      );
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success)
      throw new Error(
        "Os dados recebidos estão incompletos. Atualize as áreas ou tente novamente.",
      );
    return parsed.data;
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(
        "A consulta demorou demais ou foi cancelada. Tente novamente.",
      );
    if (error instanceof TypeError)
      throw new Error(
        "Não foi possível conectar. Confira a internet e tente novamente.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
  }
}

function versionPath(network: NavigationNetworkParams) {
  return `/${encodeURIComponent(network.networkId)}/versions/${encodeURIComponent(network.version)}`;
}
export function fetchNavigationNetworks(offset: number, signal: AbortSignal) {
  return request(`?limit=50&offset=${offset}`, navigationNetworksPageSchema, {
    signal,
  });
}
export function fetchNavigationVersion(
  network: NavigationNetworkParams,
  signal: AbortSignal,
) {
  return request(versionPath(network), navigationNetworkVersionSchema, {
    signal,
  });
}
export function calculateNavigationRoute(
  network: NavigationNetworkParams,
  input: NavigationRequest,
) {
  return request(`${versionPath(network)}/route`, navigationResultSchema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(navigationRequestSchema.parse(input)),
  });
}

export function calculateAnchorNavigationRoute(
  network: NavigationNetworkParams,
  input: NavigationAnchorRequest,
) {
  return request(
    `${versionPath(network)}/route-by-anchors`,
    navigationAnchorResultSchema,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(navigationAnchorRequestSchema.parse(input)),
    },
  );
}
