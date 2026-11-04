import { z } from "zod";

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
