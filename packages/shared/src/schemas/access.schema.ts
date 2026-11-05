import { z } from "zod";
import { anchorSchema } from "./anchor.schema.js";

export const accessPolicySchema = z.object({ requiresTeamAccess: z.boolean() });

const optionalValue = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);
const databaseUrl = optionalValue.pipe(
  z
    .string()
    .url()
    .refine((value) => {
      const protocol = new URL(value).protocol;
      return protocol === "postgres:" || protocol === "postgresql:";
    }, "Informe uma conexão PostgreSQL")
    .optional(),
);

const httpUrl = z
  .string()
  .url()
  .refine(
    (value) => new URL(value).protocol.startsWith('http'),
    'Informe uma URL HTTP(S) válida',
  );

export const apiEnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(8000),
    DATABASE_URL: databaseUrl,
    DATABASE_MIGRATION_URL: databaseUrl,
    BETTER_AUTH_URL: httpUrl.default("http://127.0.0.1:8000"),
    BETTER_AUTH_SECRET: optionalValue.pipe(
      z
        .string()
        .min(32, "O secret deve ter ao menos 32 caracteres")
        .max(512)
        .optional(),
    ),
    ADMIN_EMAIL: optionalValue.pipe(
      z
        .string()
        .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Informe um e-mail válido")
        .optional(),
    ),
    ADMIN_PASSWORD: optionalValue.pipe(
      z.string().min(8).max(128).optional(),
    ),
    CORS_ORIGINS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean),
      )
      .pipe(
        z.array(
          z
            .string()
            .url()
            .refine((value) => {
              const url = new URL(value);
              return (
                ["http:", "https:"].includes(url.protocol) &&
                !url.username &&
                !url.password &&
                url.pathname === "/" &&
                !url.search &&
                !url.hash
              );
            }, "Informe somente a origem HTTP/HTTPS, sem caminho"),
        ),
      )
      .transform((origins) => origins.map((origin) => new URL(origin).origin)),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV !== "production") return;
    for (const key of ["DATABASE_URL", "BETTER_AUTH_SECRET"] as const) {
      if (!environment[key])
        context.addIssue({
          code: "custom",
          path: [key],
          message: "Obrigatório em produção",
        });
    }
  });
export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;

/**
 * Credenciais de autenticação (better-auth e-mail + senha).
 */
export const signInSchema = z.strictObject({
  email: z
    .string()
    .trim()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Informe um e-mail válido"),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres").max(128),
});
export type SignInDto = z.infer<typeof signInSchema>;

export const signUpSchema = signInSchema.extend({
  name: z.string().trim().min(2, "Informe seu nome").max(120),
});
export type SignUpDto = z.infer<typeof signUpSchema>;

export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const adminSessionSchema = z.object({
  canEdit: z.literal(true),
  user: authUserSchema,
});
export type AdminSession = z.infer<typeof adminSessionSchema>;

/**
 * Detalhe enriquecido de uma âncora (com imagens e vínculo a place).
 */
export const anchorDetailSchema = anchorSchema.extend({
  longDescription: z.string().optional().nullable(),
  images: z.array(z.string()).default([]),
  placeId: z.string().uuid().optional().nullable(),
});
export type AnchorDetail = z.infer<typeof anchorDetailSchema>;

/**
 * Requisição de rota pedestrian (POST /routing/route).
 */
export const routeRequestSchema = z.strictObject({
  origin: z.strictObject({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  target: z.union([
    z.strictObject({ anchorId: z.string().uuid() }),
    z.strictObject({ placeId: z.string().uuid() }),
    z.strictObject({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    }),
  ]),
  profile: z.enum(['fast', 'accessible']).optional().default('fast'),
});
export type RouteRequest = z.infer<typeof routeRequestSchema>;

export const routePointSchema = z.strictObject({
  latitude: z.number(),
  longitude: z.number(),
});
export type RoutePoint = z.infer<typeof routePointSchema>;

export const routeSegmentSchema = z.strictObject({
  instruction: z.enum(['straight', 'left', 'right', 'arrive']),
  meters: z.number(),
});
export type RouteSegment = z.infer<typeof routeSegmentSchema>;

export const routeResponseSchema = z.object({
  path: z.array(routePointSchema),
  distanceMeters: z.number(),
  segments: z.array(routeSegmentSchema),
});
export type RouteResponse = z.infer<typeof routeResponseSchema>;
