import { Global, Module } from '@nestjs/common';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { apiEnvironmentSchema, type ApiEnvironment } from 'shared';

loadEnv({
  path: fileURLToPath(new URL('../../../.env.api', import.meta.url)),
  quiet: true,
});
export const API_CONFIG = Symbol('API_CONFIG');

export function loadApiConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApiEnvironment {
  const parsed = apiEnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
    ];
    throw new Error(
      `Configuração de API inválida: ${fields.join(', ')}. Confira as variáveis de ambiente.`,
    );
  }
  return parsed.data;
}

@Global()
@Module({
  providers: [{ provide: API_CONFIG, useFactory: () => loadApiConfig() }],
  exports: [API_CONFIG],
})
export class RuntimeConfigModule {}
