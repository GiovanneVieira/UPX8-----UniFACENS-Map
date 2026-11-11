import { z } from 'zod';

/**
 * Formatos de modelo 3D aceitos no upload (suportados pelo Viro3DObject).
 * FBX é sempre convertido para GLB no servidor (o binário oficial ViroFBX é
 * macOS-only; a API roda em Linux). VRX pronto é aceito sem conversão.
 */
export const modelFormatSchema = z.enum(['glb', 'gltf', 'obj', 'fbx', 'vrx']);
export type ModelFormat = z.infer<typeof modelFormatSchema>;

/** Limite de tamanho por arquivo de modelo (1MB — marcadores low-poly). */
export const MODEL_UPLOAD_LIMIT_BYTES = 1_048_576;

/** Extensões aceitas no upload de modelos (arquivo único, sem acompanhantes). */
export const MODEL_ACCEPTED_EXTENSIONS = ['.glb', '.gltf', '.obj', '.vrx'] as const;

/** Mensagem padrão para recusa de arquivo de modelo. */
export const MODEL_UPLOAD_HINT =
  'Envie um arquivo único .glb, .gltf (com buffers embutidos), .obj ou .vrx de até 1 MB. FBX não é aceito — exporte como GLB.';

/**
 * Modelo publicado no catálogo. As URLs podem ser absolutas (S3 público) ou
 * relativas à origem da API (`/uploads/...` no adapter local de dev/testes) —
 * o client resolve com `resolveAssetUrl`.
 */
export const modelSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  format: modelFormatSchema,
  sizeBytes: z.number().int().positive(),
  /** URL renderizável: GLB derivado quando a origem é FBX, senão o original. */
  url: z.string().min(1),
  /** URL do arquivo original enviado. */
  originalUrl: z.string().min(1),
  /** true quando o original FBX foi convertido para um GLB derivado. */
  converted: z.boolean(),
  createdAt: z.string(),
});
export type Model = z.infer<typeof modelSchema>;

export const adminModelsPageSchema = z.object({
  items: z.array(
    modelSchema.extend({
      /** Categoria vinculada a este modelo (categoria é mandante 1:1). */
      category: z
        .object({ id: z.string().uuid(), label: z.string() })
        .nullable(),
    }),
  ),
  total: z.number().int().nonnegative(),
});
export type AdminModelsPage = z.infer<typeof adminModelsPageSchema>;
