import { accessPolicySchema, teamAccessResultSchema } from "shared";
import { getApiBaseUrl } from "@/services/api";

export async function fetchAccessPolicy(signal: AbortSignal) {
  const response = await fetch(`${getApiBaseUrl()}/access`, { signal });
  if (!response.ok)
    throw new Error("Não foi possível consultar as permissões.");
  return accessPolicySchema.parse(await response.json());
}

export async function verifyTeamAccess(token: string) {
  const response = await fetch(`${getApiBaseUrl()}/access/team`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {
    throw new Error(
      "Não foi possível validar o acesso. Confira a conexão e tente novamente.",
    );
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Código de acesso inválido. Confira o código com a equipe."
        : "Não foi possível validar o acesso. Tente novamente.",
    );
  return teamAccessResultSchema.parse(await response.json());
}
