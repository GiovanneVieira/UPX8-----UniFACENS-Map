import { z } from 'zod';

/**
 * Tupla 3D cartesiana [x, y, z] em metros (usada pelo ARCore em tempo de execução).
 */
export const vector3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type Vector3 = z.infer<typeof vector3Schema>;

/**
 * Schema para entidade Anchor persistida no PostgreSQL (Google ARCore Cloud Anchors).
 */
export const anchorSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'O nome é obrigatório').max(255),
  cloudAnchorId: z.string().min(1, 'O Cloud Anchor ID é obrigatório'),
  description: z.string().max(1000).optional().nullable(),
  position: vector3Schema.optional().nullable(),
  createdAt: z.string(),
  arPosition: vector3Schema.optional(),
});
export type Anchor = z.infer<typeof anchorSchema>;

// Alias para compatibilidade transitória
export const anchorCoordinateSchema = anchorSchema;
export type AnchorCoordinate = Anchor;

/**
 * Schema para criação de uma âncora vinculada ao Google Cloud Anchor.
 */
export const createAnchorSchema = z.object({
  name: z.string().trim().min(1, 'O nome da âncora é obrigatório').max(255),
  cloudAnchorId: z.string().trim().min(1, 'O Cloud Anchor ID é obrigatório'),
  description: z.string().trim().max(1000).optional().nullable(),
  position: vector3Schema.optional().nullable(),
});
export type CreateAnchorDto = z.infer<typeof createAnchorSchema>;
