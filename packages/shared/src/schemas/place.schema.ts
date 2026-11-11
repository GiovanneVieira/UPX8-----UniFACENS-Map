import { z } from "zod";
import { categoryRefSchema } from "./category.schema.js";

// As categorias de locais são entidades gerenciadas no painel administrativo
// (tabela `categories` + GET /categories). O enum hardcoded foi migrado para
// seed — labels e listas vêm da API (Single Source of Truth: banco).

export const placeSourceSchema = z.enum([
  "team_report",
  "field_survey",
  "demo",
]);
export const PLACE_SOURCE_LABELS = {
  team_report: "Informação da equipe",
  field_survey: "Levantamento presencial",
  demo: "Demonstração",
} as const;

// Encontrar um recurso não certifica sua condição física nem uma rota até ele.
export const createPlaceSchema = z.strictObject({
  name: z.string().trim().min(1, "Informe o nome do local").max(255),
  categoryId: z.string().uuid("Selecione uma categoria válida"),
  latitude: z
    .number({ error: "Informe uma latitude válida em graus decimais" })
    .finite()
    .min(-90, "A latitude deve ser maior ou igual a -90")
    .max(90, "A latitude deve ser menor ou igual a 90"),
  longitude: z
    .number({ error: "Informe uma longitude válida em graus decimais" })
    .finite()
    .min(-180, "A longitude deve ser maior ou igual a -180")
    .max(180, "A longitude deve ser menor ou igual a 180"),
  building: z.string().trim().max(80).nullable().optional(),
  floor: z
    .number({ error: "Informe um andar válido" })
    .int({ error: "O andar deve ser um número inteiro" })
    .min(-10, "O andar deve ser maior ou igual a -10")
    .max(200, "O andar deve ser menor ou igual a 200")
    .nullable()
    .optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  source: placeSourceSchema.default("team_report"),
});
export type CreatePlaceDto = z.infer<typeof createPlaceSchema>;

// Entrada textual de formulários: aceita ponto ou vírgula decimal, sem converter vazio em zero.
const coordinateInput = z
  .string()
  .trim()
  .regex(
    /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/,
    "Informe uma coordenada em graus decimais",
  )
  .transform((value) => Number(value.replace(",", ".")));
export const placePositionSchema = createPlaceSchema.pick({
  latitude: true,
  longitude: true,
});
export type PlacePosition = z.infer<typeof placePositionSchema>;
export const placePositionFormSchema = z.object({
  latitude: coordinateInput.pipe(createPlaceSchema.shape.latitude),
  longitude: coordinateInput.pipe(createPlaceSchema.shape.longitude),
});
export const createPlaceFormSchema = z
  .strictObject({
    name: z.string(),
    categoryId: z.string().uuid("Selecione uma categoria"),
    latitude: coordinateInput,
    longitude: coordinateInput,
    building: z
      .string()
      .trim()
      .transform((value) => value || null),
    floor: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : Number(value))),
    description: z
      .string()
      .trim()
      .transform((value) => value || null),
    source: placeSourceSchema,
  })
  .pipe(
    createPlaceSchema.required({
      building: true,
      floor: true,
      description: true,
      source: true,
    }),
  );
export type PlaceFormValues = z.input<typeof createPlaceFormSchema>;

export const updatePlaceSchema = createPlaceSchema
  .omit({ source: true })
  .partial()
  .extend({ source: placeSourceSchema.optional() })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Informe ao menos um campo para atualizar",
  );
export type UpdatePlaceDto = z.infer<typeof updatePlaceSchema>;

export const placeSchema = createPlaceSchema.extend({
  id: z.string().uuid(),
  category: categoryRefSchema,
  building: z.string().nullable(),
  floor: z.number().int().nullable(),
  description: z.string().nullable(),
  verificationStatus: z.enum(["unverified", "verified"]),
  verifiedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Place = z.infer<typeof placeSchema>;

export const placesQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  /** Filtro por slug da categoria (compatível com os 11 seeds). */
  category: z.string().trim().max(60).optional(),
  /** Filtro por id da categoria (forma canônica). */
  categoryId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type PlacesQuery = z.infer<typeof placesQuerySchema>;
export const placesPageSchema = z.object({
  items: z.array(placeSchema),
  total: z.number().int().min(0),
});
export type PlacesPage = z.infer<typeof placesPageSchema>;
