import { NestFactory } from '@nestjs/core';
import {
  ExpressAdapter,
  type NestExpressApplication,
} from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { AppModule, ObserveInstrument } from './app.module.js';
import { API_CONFIG } from './config/runtime-config.js';
import type { ApiEnvironment } from 'shared';
import { configureHttp } from './config/configure-http.js';

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
    hasObserveKeys ? { instrument: ObserveInstrument } : {},
  );
  app.enableShutdownHooks();
  const config = app.get<ApiEnvironment>(API_CONFIG);
  configureHttp(app, config);

  // Configuração OpenAPI / Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('UniFACENS Map API')
    .setDescription(
      'Catálogo de locais do campus UniFACENS e âncoras espaciais para realidade aumentada',
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'team-access')
    .addTag('access', 'Acesso da equipe para edição e exclusão')
    .addTag('anchors', 'Gerenciamento de Google ARCore Cloud Anchors')
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
