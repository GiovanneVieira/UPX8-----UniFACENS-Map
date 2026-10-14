import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ApiEnvironment } from 'shared';

export function configureHttp(
  app: NestExpressApplication,
  config: ApiEnvironment,
) {
  app.enableCors({
    origin:
      config.CORS_ORIGINS.length > 0
        ? config.CORS_ORIGINS
        : config.NODE_ENV === 'production'
          ? false
          : true,
    methods: 'GET,HEAD,POST,PATCH,DELETE,OPTIONS',
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
}
