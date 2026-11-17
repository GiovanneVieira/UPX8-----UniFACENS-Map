import { z } from 'zod';
import { anchorCategorySchema, categoryModelSchema } from './category.schema.js';

/**
 * Tupla 3D cartesiana [x, y, z] em metros (usada pelo ARCore em tempo de execução).
 */
export const vector3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type Vector3 = z.infer<typeof vector3Schema>;

/**
 * Guardrails de range para coordenadas WGS84 — um bug no client não pode
 * gravar coordenadas absurdas sem barreira (lat/lng/alt fora do físico).
 */
const latitudeRange = z.number().min(-90).max(90);
const longitudeRange = z.number().min(-180).max(180);
const altitudeRange = z.number().min(-100).max(10000);
const headingRange = z.number().min(0).max(360);

/**
 * Schema para entidade Anchor persistida no PostgreSQL (Google ARCore Cloud Anchors).
 * `position` (coordenadas AR do mundo local) foi REMOVIDO: era session-relative
 * (origem = pose do celular no launch da sessão) — lixo entre sessões.
 * O SSOT geográfico é lat/lng/alt; `arPosition` é runtime-only (client).
 */
export const anchorSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'O nome é obrigatório').max(255),
  cloudAnchorId: z.string().min(1, 'O Cloud Anchor ID é obrigatório'),
  description: z.string().max(1000).optional().nullable(),
  latitude: latitudeRange.optional().nullable(),
  longitude: longitudeRange.optional().nullable(),
  altitude: altitudeRange.optional().nullable(),
  heading: headingRange.optional().nullable(),
  createdAt: z.string(),
  arPosition: vector3Schema.optional(),
  distanceMeters: z.number().optional(),
  /** Categoria do ponto — define o modelo 3D renderizado no AR (null = padrão). */
  category: anchorCategorySchema.nullable().default(null),
  /** Modelo 3D OVERRIDE do pin (null = usa o modelo da categoria). */
  modelId: z.string().uuid().optional().nullable(),
  /** Modelo renderizável do pin (join pelo modelId; null = herda da categoria). */
  model: categoryModelSchema.nullable().optional(),
  /** Runtime-only (client): pin sem âncora nativa — projeção estimada. */
  estimated: z.boolean().optional(),
  /** Runtime-only (client): envelope de erro da estimativa (m). */
  estimateAccuracyM: z.number().optional(),
  /**
   * Runtime-only (client): pin cloud PENDENTE de resolve projetado como
   * estimativa "ghost" — não selecionável; o resolve o substitui com
   * transição suave (one-way: nunca volta a GPS depois de cravado).
   */
  isGhost: z.boolean().optional(),
  /**
   * Offset do pin no frame da âncora de NUVEM visual (Cloud Anchor). Ao
   * contrário do antigo `position` (session-relative, lixo entre sessões),
   * o frame da cloud anchor é estável — o offset persiste com significado.
   */
  frameOffset: vector3Schema.optional().nullable(),
  /**
   * UUID da plataforma ReactVision da âncora geoespacial hospedada
   * (hostGeospatialAnchor). Camada intermediária de precisão: cloud visual
   * (cm) > geospatial (m) > projeção client-side. Null = pin cloud-only.
   */
  geospatialAnchorId: z.string().optional().nullable(),
  /** Acurácia horizontal (m, 95%) da pose no momento do hosting geoespacial. */
  geospatialAccuracyM: z.number().optional().nullable(),
  /**
   * Ajuste fino de ALTITUDE por ponto (m, −50..+50): somado ao Y apenas
   * nas camadas imprecisas (âncora geospatial nativa + estimativa ENU) —
   * corrige o viés vertical do GPS no hosting (±5–15m fácil). O cloud
   * anchor visual (cm, onde o usuário tocou) NÃO recebe offset.
   */
  altitudeOffsetM: z.number().min(-50).max(50).optional().nullable(),
  /** Imagens do ponto (URLs resolvidas pelo serializer — ordem = ordem de exibição). */
  images: z.array(z.string()).optional(),
  /** Informações detalhadas do ponto (texto longo, opcional). */
  longDescription: z.string().optional().nullable(),
});
export type Anchor = z.infer<typeof anchorSchema>;

// Alias para compatibilidade transitória
export const anchorCoordinateSchema = anchorSchema;
export type AnchorCoordinate = Anchor;

/**
 * Schema para criação de uma âncora vinculada ao Google Cloud Anchor ou Geoespacial.
 */
export const createAnchorSchema = z.object({
  name: z.string().trim().min(1, 'O nome da âncora é obrigatório').max(255),
  cloudAnchorId: z.string().trim().min(1, 'O Cloud Anchor ID é obrigatório'),
  description: z.string().trim().max(1000).optional().nullable(),
  categoryId: z.string().uuid('Categoria inválida').optional().nullable(),
  /** Modelo 3D override do pin (null = modelo da categoria). */
  modelId: z.string().uuid('Modelo inválido').optional().nullable(),
  latitude: latitudeRange.optional().nullable(),
  longitude: longitudeRange.optional().nullable(),
  altitude: altitudeRange.optional().nullable(),
  heading: headingRange.optional().nullable(),
  /** UUID RV da âncora geoespacial, quando o host resolveu antes do save. */
  geospatialAnchorId: z.string().trim().min(1).optional(),
  geospatialAccuracyM: z.number().min(0).max(10000).optional(),
  /** Ajuste fino de altitude (m) — corrigiu viés vertical do hosting. */
  altitudeOffsetM: z.number().min(-50).max(50).optional().nullable(),
});
export type CreateAnchorDto = z.infer<typeof createAnchorSchema>;

/**
 * Atualização parcial de âncora — usada pelo fluxo de ancoragem visual:
 * após hospedar o Cloud Anchor (scan do ambiente), o app grava o ID real
 * da nuvem + o offset do pin no frame da âncora.
 */
export const updateAnchorSchema = z
  .object({
    cloudAnchorId: z.string().trim().min(1).optional(),
    frameOffset: vector3Schema.optional().nullable(),
    categoryId: z.string().uuid('Categoria inválida').optional().nullable(),
    /** UUID RV da âncora geoespacial hospedada (grava quando o host resolve após o save). */
    geospatialAnchorId: z.string().trim().min(1).optional(),
    geospatialAccuracyM: z.number().min(0).max(10000).optional(),
    /** Ajuste fino de altitude (m) — null zera. */
    altitudeOffsetM: z.number().min(-50).max(50).nullable().optional(),
  })
  .refine(
    (dto) =>
      dto.cloudAnchorId !== undefined ||
      dto.frameOffset !== undefined ||
      dto.categoryId !== undefined ||
      dto.geospatialAnchorId !== undefined ||
      dto.geospatialAccuracyM !== undefined,
    {
      message: 'Informe ao menos um campo para atualizar',
    },
  );
export type UpdateAnchorDto = z.infer<typeof updateAnchorSchema>;

