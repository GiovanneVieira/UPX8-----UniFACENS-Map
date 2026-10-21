import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { AppModule, ObserveInstrument } from './app.module.js';

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
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Configuração OpenAPI / Swagger
  const swaggerConfig = new DocumentBuilder()
    .setBasePath('/scalar')
    .setTitle('UniFACENS Map API')
    .setDescription(
      'Catálogo de Âncoras Espaciais e Google ARCore Cloud Anchors para o campus UniFACENS',
    )
    .setVersion('1.0.0')
    .addTag('anchors', 'Gerenciamento de Google ARCore Cloud Anchors')
    .addTag('health', 'Healthcheck e Status da Aplicação')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  // Documentação Interativa com Scalar UI
  app.use(
    '/scalar',
    apiReference({
      spec: {
        content: document,
      },
      theme: 'kepler',
    }),
  );

  const port = Number(process.env.PORT ?? 3000);

  let retries = 5;
  while (retries > 0) {
    try {
      await app.listen(port);
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

  const shutdown = async () => {
    try {
      await app.close();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
await bootstrap();
