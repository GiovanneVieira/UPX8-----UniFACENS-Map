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
    /**
     * Schemes de app nativo confiáveis no better-auth (origem do header
     * `expo-origin` enviado pelo expoClient). O plugin expo do servidor
     * SOBRESCREVE o `origin` do request com esse valor e o sign-in valida a
     * origem mesmo sem cookie — sem o scheme listado, TODO login do app
     * nativo em produção recebe 403 INVALID_ORIGIN (lição 2026-11-18).
     * Apenas `scheme://` (sem host/caminho); origens HTTP(S) → CORS_ORIGINS.
     */
    TRUSTED_APP_ORIGINS: z
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
          z.string().regex(
            /^[a-z][a-z0-9+.-]*:\/\/$/,
            "Informe apenas o scheme do app (ex.: unifacensclient://), sem host ou caminho; origens HTTP(S) pertencem ao CORS_ORIGINS",
          ),
        ),
      ),
    /**
     * Redis (better-auth secondaryStorage): OTPs do plugin emailOTP e
     * rate-limits vivem aqui quando configurado (TTL nativo). Vazio =
     * fallback graceful para a `verification` table do Postgres.
     * `rediss://` (TLS) incluído — provedores gerenciados (Upstash, Render
     * Key Value externo) exigem; node-redis ativa TLS pela scheme da URL.
     */
    REDIS_URL: optionalValue.pipe(
      z
        .string()
        .url()
        .refine(
          (value) =>
            new URL(value).protocol === 'redis:' ||
            new URL(value).protocol === 'rediss:',
          'Informe uma URL redis:// ou rediss:// (TLS) válida',
        )
        .optional(),
    ),
    /**
     * Envio de e-mail (nodemailer) para os OTPs de verificação/reset.
     * Em produção é OBRIGATÓRIA (fail-fast no boot): com
     * requireEmailVerification ativo, novos usuários não conseguem verificar
     * a conta sem e-mail de verdade. Fora de produção, vazio = dev fallback
     * (OTP logado no console da API).
     */
    SMTP_URL: optionalValue.pipe(
      z
        .string()
        .url()
        .refine(
          (value) => new URL(value).protocol === "smtp:" || new URL(value).protocol === "smtps:",
          "Informe uma URL smtp:// ou smtps:// (host:port; 587 STARTTLS ou 465 TLS)",
        )
        .optional(),
    ),
    SMTP_FROM: optionalValue.pipe(z.string().min(3).max(320).optional()),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV !== "production") return;
    for (const key of ["DATABASE_URL", "BETTER_AUTH_SECRET", "SMTP_URL"] as const) {
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
  /** URL do avatar (S3) — null quando o usuário nunca enviou foto. */
  image: z.string().nullable().default(null),
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
  // ⚠️ `profile` (fast|accessible) foi REMOVIDO (2026-11-19): era aceito e
  // silenciosamente ignorado pelo service — campo morto que enganava. A
  // acessibilidade vive na rede de navegação (navigation/networks); esta
  // rota é o grid A* da tab AR (sem noção de acessibilidade).
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
