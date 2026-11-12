import { z } from 'zod';

/**
 * Âncoras órfãs — hospedadas na plataforma ReactVision (visual cloud anchor)
 * mas SEM registro no banco (ex.: modal de criação fechado na fase `hosted`,
 * pós-hosting e pré-"Salvar": o cloudAnchorId já existe, o pin não).
 *
 * A adoção (POST /anchors reaproveitando o cloudAnchorId) torna o pin
 * visível/resolvível sem re-hospedar — ver painel admin "Âncoras órfãs".
 */

/** Provider inferido do prefixo do cloudAnchorId (classificação §15.12). */
export const orphanProviderSchema = z.enum(['reactvision', 'google']);
export type OrphanProvider = z.infer<typeof orphanProviderSchema>;

export const orphanAnchorSchema = z.object({
  cloudAnchorId: z.string().min(1),
  provider: orphanProviderSchema,
  /** Qualidade do dataset visual (doc: ≥300 keypoints recomendado). */
  keypoints: z.number().int().nonnegative().nullable(),
  resolveCount: z.number().int().nonnegative().nullable(),
  successfulResolveCount: z.number().int().nonnegative().nullable(),
  averageConfidence: z.number().min(0).max(1).nullable(),
  /** GPS tag do hosting (presente no caminho hostCloudAnchor por PONTO). */
  gps: z.object({ latitude: z.number(), longitude: z.number() }).nullable(),
  /** Quando a âncora foi hospedada na plataforma (ISO) — o TTL conta daqui. */
  hostedAt: z.string().nullable(),
});
export type OrphanAnchor = z.infer<typeof orphanAnchorSchema>;
