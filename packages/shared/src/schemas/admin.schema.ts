import { z } from 'zod';
import { anchorDetailSchema } from './access.schema.js';

export const adminListQuerySchema = z.object({
  search: z.string().trim().max(100).default(''),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type AdminListQuery = z.infer<typeof adminListQuerySchema>;
export const updateAdminPointSchema = z
  .strictObject({
    name: z
      .string()
      .trim()
      .min(1, 'Informe o nome do ponto.')
      .max(255)
      .optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    longDescription: z.string().trim().max(10000).nullable().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    'Informe os dados para editar.',
  );
export type UpdateAdminPoint = z.infer<typeof updateAdminPointSchema>;
export const adminUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  emailVerified: z.boolean(),
  banned: z.boolean(),
  createdAt: z.string(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;
export const adminPointsPageSchema = z.object({
  items: z.array(anchorDetailSchema),
  total: z.number().int().nonnegative(),
});
export const adminUsersPageSchema = z.object({
  items: z.array(adminUserSchema),
  total: z.number().int().nonnegative(),
});
