import { Global, Module } from '@nestjs/common';
import { STORAGE, type StorageAdapter } from './storage.types.js';
import { LocalStorageAdapter, defaultKeyPrefix } from './local.adapter.js';
import { S3StorageAdapter } from './s3.adapter.js';

/**
 * Seleção do adapter: STORAGE_DRIVER=s3 exige as credenciais S3_*;
 * qualquer outro valor (ou ausência de credenciais) usa o disco local —
 * dev e testes rodam sem rede.
 *
 * Prefixo de ambiente (STORAGE_PREFIX ou NODE_ENV → dev/prod) isola os
 * objetos por ambiente: dev/... e prod/... no mesmo bucket/disco.
 */
function createStorage(): StorageAdapter {
  const driver = process.env.STORAGE_DRIVER?.toLowerCase();
  const s3Config = {
    bucket: process.env.S3_BUCKET,
    region: process.env.S3_REGION,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    endpoint: process.env.S3_ENDPOINT,
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL,
  };
  const keyPrefix = defaultKeyPrefix();
  const s3Ready = Boolean(
    s3Config.bucket &&
      s3Config.region &&
      s3Config.accessKeyId &&
      s3Config.secretAccessKey &&
      s3Config.publicBaseUrl,
  );
  if (driver === 's3' && !s3Ready) {
    throw new Error(
      'STORAGE_DRIVER=s3 exige S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY e S3_PUBLIC_BASE_URL.',
    );
  }
  if (driver === 's3') {
    console.log(
      '[Storage] Driver S3 ativo (bucket %s, prefixo "%s/").',
      s3Config.bucket,
      keyPrefix,
    );
    // Endpoint só faz sentido para providers S3-compatíveis (R2/B2/MinIO)
    // e precisa ser http(s):// — valor inválido é ignorado com aviso.
    const endpoint = s3Config.endpoint || '';
    if (endpoint && !/^https?:\/\//i.test(endpoint)) {
      console.warn(
        '[Storage] S3_ENDPOINT="%s" não é uma URL http(s) válida — ignorado (AWS padrão).',
        endpoint,
      );
    }
    return new S3StorageAdapter({
      bucket: s3Config.bucket!,
      region: s3Config.region!,
      accessKeyId: s3Config.accessKeyId!,
      secretAccessKey: s3Config.secretAccessKey!,
      endpoint: /^https?:\/\//i.test(endpoint) ? endpoint : undefined,
      publicBaseUrl: s3Config.publicBaseUrl!,
      keyPrefix,
    });
  }
  if (driver && driver !== 'local') {
    console.warn(
      '[Storage] STORAGE_DRIVER=%s desconhecido — usando disco local.',
      driver,
    );
  }
  console.log('[Storage] Driver local ativo (prefixo "%s/").', keyPrefix);
  return new LocalStorageAdapter(undefined, keyPrefix);
}

@Global()
@Module({
  providers: [{ provide: STORAGE, useFactory: createStorage }],
  exports: [STORAGE],
})
export class StorageModule {}
