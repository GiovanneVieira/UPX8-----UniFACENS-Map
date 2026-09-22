import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './db/database.module.js';
import { AnchorsModule } from './anchors/anchors.module.js';

const hasObserveKeys = Boolean(
  process.env.OBSERVE_APP_KEY &&
    process.env.OBSERVE_APP_KEY !== 'YOUR_APP_KEY' &&
    process.env.OBSERVE_APP_SECRET &&
    process.env.OBSERVE_APP_SECRET !== 'YOUR_APP_SECRET',
);

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    DatabaseModule,
    AnchorsModule,
    ...(hasObserveKeys
      ? [
          ObserveModule.forRoot({
            appKey: process.env.OBSERVE_APP_KEY!,
            appSecret: process.env.OBSERVE_APP_SECRET!,
            serviceId: process.env.OBSERVE_SERVICE_ID || 'unifacens-api',
          }),
        ]
      : []),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
