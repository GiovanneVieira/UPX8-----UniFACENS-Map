import { z } from 'zod';

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
  /** Runtime-only (client): pin sem âncora nativa — projeção estimada. */
  estimated: z.boolean().optional(),
  /** Runtime-only (client): envelope de erro da estimativa (m). */
  estimateAccuracyM: z.number().optional(),
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
  latitude: latitudeRange.optional().nullable(),
  longitude: longitudeRange.optional().nullable(),
  altitude: altitudeRange.optional().nullable(),
  heading: headingRange.optional().nullable(),
});
export type CreateAnchorDto = z.infer<typeof createAnchorSchema>;

