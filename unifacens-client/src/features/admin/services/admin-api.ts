import {
  adminPointsPageSchema,
  adminUsersPageSchema,
  anchorDetailSchema,
  updateAdminPointSchema,
  z,
  type AdminListQuery,
  type UpdateAdminPoint,
} from 'shared';
import { getApiBaseUrl } from '@/services/api';
import { getTeamAuthorization } from '@/services/team-authorization';
import { useAuthStore } from '@/stores/use-auth-store';

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (init.signal?.aborted) cancel();
  else init.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 30000);
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { ...getTeamAuthorization(), ...init.headers },
    });
    if (response.status === 401) {
      useAuthStore.getState().clearSession();
      throw new Error('Sessão expirada. Entre novamente.');
    }
    if (response.status === 403)
      throw new Error('Acesso exclusivo de administradores.');
    if (response.status === 404)
      throw new Error('Este ponto não está mais disponível. Atualize a lista.');
    if (response.status === 413)
      throw new Error('Cada imagem deve ter no máximo 5 MB.');
    if (!response.ok)
      throw new Error(
        'Não foi possível concluir a operação. Confira os dados e tente novamente.',
      );
    return schema.parse(await response.json());
  } catch (error) {
    if (controller.signal.aborted && !init.signal?.aborted)
      throw new Error(
        'O servidor demorou para responder. Atualize os dados antes de tentar novamente.',
      );
    if (error instanceof TypeError)
      throw new Error(
        'Não foi possível conectar ao servidor. Verifique sua conexão.',
      );
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', cancel);
  }
}

export const adminApi = {
  points: (query: AdminListQuery, signal: AbortSignal) =>
    request(
      `/admin/points?${new URLSearchParams({ search: query.search, offset: String(query.offset), limit: String(query.limit) })}`,
      adminPointsPageSchema,
      { signal },
    ),
  users: (query: AdminListQuery, signal: AbortSignal) =>
    request(
      `/admin/users?${new URLSearchParams({ search: query.search, offset: String(query.offset), limit: String(query.limit) })}`,
      adminUsersPageSchema,
      { signal },
    ),
  updatePoint: (id: string, dto: UpdateAdminPoint) =>
    request(`/admin/points/${encodeURIComponent(id)}`, anchorDetailSchema, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateAdminPointSchema.parse(dto)),
    }),
  deletePoint: (id: string) =>
    request(
      `/anchors/${encodeURIComponent(id)}`,
      z.object({ success: z.boolean() }),
      { method: 'DELETE' },
    ),
  uploadImages: (id: string, files: File[]) => {
    if (!files.length || files.length > 5)
      throw new Error('Selecione entre 1 e 5 imagens.');
    if (
      files.some(
        (file) =>
          file.size > 5 * 1024 * 1024 ||
          !['image/jpeg', 'image/png', 'image/webp'].includes(file.type),
      )
    )
      throw new Error('Envie imagens JPEG, PNG ou WebP de até 5 MB cada.');
    const body = new FormData();
    files.forEach((file) => body.append('files', file));
    return request(
      `/anchors/${encodeURIComponent(id)}/images`,
      z.object({ images: z.array(z.string()) }),
      { method: 'POST', body },
    );
  },
};

export function adminImageUrl(path: string) {
  if (path.startsWith('/uploads/anchors/')) return `${getApiBaseUrl()}${path}`;
  if (/^https:\/\//i.test(path)) return path;
  return undefined;
}
