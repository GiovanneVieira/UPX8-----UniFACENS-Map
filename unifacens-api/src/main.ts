import { toNodeHandler } from 'better-auth/node';
import { NestFactory } from '@nestjs/core';
import {
  ExpressAdapter,
  type NestExpressApplication,
} from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import express from 'express';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AppModule, ObserveInstrument } from './app.module.js';
import { API_CONFIG } from './config/runtime-config.js';
import type { ApiEnvironment } from 'shared';
import { configureHttp } from './config/configure-http.js';import { BETTER_AUTH, type BetterAuthInstance } from './common/auth/better-auth.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { requestLoggingMiddleware } from './common/middleware/request-logging.middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, '../uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const hasObserveKeys = Boolean(
  process.env.OBSERVE_APP_KEY &&
  process.env.OBSERVE_APP_KEY !== 'YOUR_APP_KEY' &&
  process.env.OBSERVE_APP_SECRET &&
  process.env.OBSERVE_APP_SECRET !== 'YOUR_APP_SECRET',
);

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(),
    hasObserveKeys
      ? { instrument: ObserveInstrument, bodyParser: false }
      : { bodyParser: false },
  );
  app.enableShutdownHooks();
  const config = app.get<ApiEnvironment>(API_CONFIG);
  const auth = app.get<BetterAuthInstance>(BETTER_AUTH);
  configureHttp(app, config);
  // Envelope de erro consistente + mapeamento de erros Postgres cruze (FK
  // RESTRICT, unique, check) — global, cobre todos os módulos.
  app.useGlobalFilters(new AllExceptionsFilter(config.NODE_ENV));

  // Better Auth: o handler exige o corpo bruto da requisição — por isso o
  // body-parser do Nest é desativado e o parsing JSON é restaurado APENAS
  // para as rotas fora de /auth, montadas depois do handler.
  const expressInstance = app.getHttpAdapter().getInstance();
  // Access log global (Frente 1): registrado ANTES de TUDO para cobrir /auth
  // (better-auth), /uploads (estático) e todas as rotas Nest. Não lê o body —
  // o handler do better-auth exige o corpo bruto.
  expressInstance.use(requestLoggingMiddleware());
  expressInstance.use('/auth', toNodeHandler(auth));
  expressInstance.use('/uploads', express.static(UPLOADS_DIR, { fallthrough: false }));
  expressInstance.use(express.json({ limit: '1mb' }));

  // Configuração OpenAPI / Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('UniFACENS Map API')
    .setDescription(
      'Catálogo de locais do campus UniFACENS e âncoras espaciais para realidade aumentada',
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'admin-bearer')
    .addTag('access', 'Acesso da equipe para edição e exclusão')
    .addTag('anchors', 'Gerenciamento de Google ARCore Cloud Anchors')
    .addTag('categories', 'Categorias de locais e pontos AR com modelo 3D vinculado')
    .addTag('models', 'Upload e gestão de modelos 3D (GLB/glTF/OBJ/VRX)')
    .addTag(
      'places',
      'Catálogo de locais do campus, coordenadas e origem das informações',
    )
    .addTag('health', 'Healthcheck e Status da Aplicação')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  // Documentação Interativa com Scalar UI
  app.use(
    ['/reference', '/scalar'],
    apiReference({
      spec: {
        content: document,
      },
      theme: 'kepler',
    }),
  );

  // Seed do admin (§13.11): UPSERT idempotente — cria/sincroniza o admin de
  // ADMIN_EMAIL/ADMIN_PASSWORD em QUALQUER ambiente no boot (é assim que o
  // admin default sobe para PRODUÇÃO sem passo manual). Falha não derruba a API.
  if (config.ADMIN_EMAIL && config.ADMIN_PASSWORD) {
    const { main: seedAdmin } = await import('./db/seed-admin.js');
    await seedAdmin(config).catch((err: unknown) =>
      console.error(
        '[SeedAdmin] falhou no boot:',
        err instanceof Error ? err.message : String(err),
      ),
    );
  }

  const port = config.PORT;

  let retries = 5;
  while (retries > 0) {
    try {
      await app.listen(port, '0.0.0.0');
      break;
    } catch (err: any) {
      if (err.code === 'EADDRINUSE' && retries > 1) {
        retries--;
        await new Promise((resolve) => setTimeout(resolve, 300));
      } else {
        throw err;
      }
    }
  }
}
await bootstrap();
