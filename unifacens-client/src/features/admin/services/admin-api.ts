import {
  adminModelsPageSchema,
  adminPointsPageSchema,
  adminUsersPageSchema,
  anchorDetailSchema,
  anchorSchema,
  categorySchema,
  createAnchorSchema,
  orphanAnchorSchema,
  updateAdminPointSchema,
  z,
  type AdminListQuery,
  type Category,
  type CreateAnchorDto,
  type CreateCategoryDto,
  type Model,
  type OrphanAnchor,
  type UpdateAdminPoint,
  type UpdateCategoryDto,
} from 'shared';
import { getApiBaseUrl, resolveAssetUrl } from '@/services/api';
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
      throw new Error('Este registro não está mais disponível. Atualize a lista.');
    if (response.status === 413)
      throw new Error('Arquivo grande demais. Respeite o limite de tamanho.');
    if (!response.ok) {
      // 409 e 400 do backend trazem mensagens prontas para exibir.
      const detail = (await response.json().catch(() => null)) as
        | { message?: string | string[] }
        | null;
      const message = Array.isArray(detail?.message)
        ? detail.message[0]
        : detail?.message;
      if (message) throw new Error(message);
      throw new Error(
        'Não foi possível concluir a operação. Confira os dados e tente novamente.',
      );
    }
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

const imageResultSchema = z.object({ images: z.array(z.string()) });

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
  /** Âncoras órfãs: hospedadas na plataforma RV sem registro no banco. */
  orphanAnchors: (signal: AbortSignal) =>
    request('/admin/orphan-anchors', z.array(orphanAnchorSchema), { signal }),
  /**
   * Adoção: registra no banco um pin reaproveitando o cloudAnchorId já
   * hospedado (sem re-hospedar — o pin passa a resolver normalmente).
   */
  adoptOrphan: (dto: CreateAnchorDto) =>
    request('/anchors', anchorSchema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createAnchorSchema.parse(dto)),
    }),
  categories: {
    list: (signal: AbortSignal) =>
      request('/categories', z.array(categorySchema), { signal }),
    create: (dto: CreateCategoryDto) =>
      request('/categories/admin', categorySchema, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      }),
    update: (id: string, dto: UpdateCategoryDto) =>
      request(`/categories/admin/${encodeURIComponent(id)}`, categorySchema, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      }),
    remove: (id: string) =>
      request(
        `/categories/admin/${encodeURIComponent(id)}`,
        z.object({ success: z.boolean() }),
        { method: 'DELETE' },
      ),
  },
  models: {
    list: (signal: AbortSignal) =>
      request('/admin/models', adminModelsPageSchema, { signal }),
    upload: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return request('/admin/models', adminModelsPageSchema.shape.items.element, {
        method: 'POST',
        body,
      });
    },
    remove: (id: string) =>
      request(
        `/admin/models/${encodeURIComponent(id)}`,
        z.object({ success: z.boolean() }),
        { method: 'DELETE' },
      ),
  },
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
    return request(`/anchors/${encodeURIComponent(id)}/images`, imageResultSchema, {
      method: 'POST',
      body,
    });
  },
  deleteImage: (id: string, key: string) =>
    request(
      `/anchors/${encodeURIComponent(id)}/images?key=${encodeURIComponent(key)}`,
      imageResultSchema,
      { method: 'DELETE' },
    ),
};

/**
 * Resolve a URL de exibição de uma imagem de ponto: absolutas (S3) passam
 * direto; legadas (/uploads/...) ganham a origem da API.
 */
export function adminImageUrl(path: string) {
  if (path.startsWith('/uploads/') || path.startsWith('points/'))
    return resolveAssetUrl(path.startsWith('/') ? path : `/${path}`);
  if (/^https?:\/\//i.test(path)) return path;
  return undefined;
}

export type { Category, Model, OrphanAnchor };
