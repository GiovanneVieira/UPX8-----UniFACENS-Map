import { z } from "zod";

export const teamAccessFormSchema = z.strictObject({
  token: z
    .string()
    .trim()
    .min(32, "Informe o código de acesso da equipe")
    .max(512)
    .regex(/^\S+$/, "O código não deve conter espaços"),
});
export const accessPolicySchema = z.object({ requiresTeamAccess: z.boolean() });
export const teamAccessResultSchema = z.object({ canEdit: z.literal(true) });

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

export const apiEnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(8000),
    DATABASE_URL: databaseUrl,
    DATABASE_MIGRATION_URL: databaseUrl,
    TEAM_ACCESS_TOKEN: optionalValue.pipe(
      z.string().min(32).max(512).regex(/^\S+$/).optional(),
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
    for (const key of ["DATABASE_URL", "TEAM_ACCESS_TOKEN"] as const) {
      if (!environment[key])
        context.addIssue({
          code: "custom",
          path: [key],
          message: "Obrigatório em produção",
        });
    }
  });
export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
