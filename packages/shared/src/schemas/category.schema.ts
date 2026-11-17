import { z } from 'zod';
import { boundingBoxSchema, modelFormatSchema } from './model.schema.js';
const slugPattern = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

/**
 * Referência mínima de uma categoria, embarcada em places e âncoras.
 */
export const categoryRefSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  label: z.string(),
});
export type CategoryRef = z.infer<typeof categoryRefSchema>;

/**
 * Modelo 3D vinculado à categoria — o que o pin AR renderiza.
 * `boundingBox` (null para legados/VRX) alimenta a recentralização no AR.
 */
export const categoryModelSchema = z.object({
  url: z.string().min(1),
  format: modelFormatSchema,
  boundingBox: boundingBoxSchema.nullable(),
});
export type CategoryModel = z.infer<typeof categoryModelSchema>;

/**
 * Categoria completa (GET /categories). `model` é null quando a categoria
 * ainda não tem modelo vinculado — o AR usa o visual padrão (ViroBox).
 */
export const categorySchema = categoryRefSchema.extend({
  sort: z.number().int(),
  /** UUID do modelo vinculado (para pré-selecionar no editor do admin). */
  modelId: z.string().uuid().nullable(),
  model: categoryModelSchema.nullable(),
});
export type Category = z.infer<typeof categorySchema>;

export const createCategorySchema = z
  .strictObject({
    label: z
      .string()
      .trim()
      .min(1, 'Informe o nome da categoria')
      .max(60, 'O nome deve ter até 60 caracteres'),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(slugPattern, 'Use letras minúsculas, números e hífens (ex.: laboratorio)')
      .max(60, 'O identificador deve ter até 60 caracteres'),
    sort: z.number().int().min(0).max(999).default(0),
    modelId: z.string().uuid().nullable().optional(),
  });
export type CreateCategoryDto = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z
  .strictObject({
    label: z.string().trim().min(1, 'Informe o nome da categoria').max(60).optional(),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(slugPattern, 'Use letras minúsculas, números e hífens (ex.: laboratorio)')
      .max(60)
      .optional(),
    sort: z.number().int().min(0).max(999).optional(),
    /** UUID do modelo, ou null para desvincular. */
    modelId: z.string().uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  });
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;

/** Categoria embarcada em âncoras/pontos AR (com o modelo p/ renderizar). */
export const anchorCategorySchema = categoryRefSchema.extend({
  modelId: z.string().uuid().nullable(),
  model: categoryModelSchema.nullable(),
});
export type AnchorCategory = z.infer<typeof anchorCategorySchema>;
