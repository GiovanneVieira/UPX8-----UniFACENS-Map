import { Injectable } from '@nestjs/common';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { defaultKeyPrefix } from './local.adapter.js';
import type { StorageAdapter, StoredObject } from './storage.types.js';

/**
 * Adapter S3 (produção — SDK oficial @aws-sdk/client-s3 v3). Bucket público
 * de leitura: a URL pública é montada a partir de S3_PUBLIC_BASE_URL —
 * estável e cacheável para o AR/mobile. Compatível com qualquer provider
 * S3 via S3_ENDPOINT (R2, B2, MinIO).
 *
 * keyPrefix (dev/prod) isola objetos por ambiente dentro do MESMO bucket —
 * detalhe interno do adapter; put() devolve a chave canônica prefixada.
 */
@Injectable()
export class S3StorageAdapter implements StorageAdapter {
  readonly driver = 's3' as const;
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private readonly keyPrefix: string;

  constructor(config: S3AdapterConfig) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint || undefined,
      forcePathStyle: Boolean(config.endpoint),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.bucket = config.bucket;
    this.publicBaseUrl = config.publicBaseUrl.replace(/\/+$/, '');
    this.keyPrefix = config.keyPrefix ?? defaultKeyPrefix();
  }

  async put(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<StoredObject> {
    const canonical = this.withPrefix(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: canonical,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return { key: canonical, url: this.url(canonical) };
  }

  async delete(key: string): Promise<void> {
    // Chaves legadas (/uploads/...) nunca viveram no S3 — no-op.
    if (key.startsWith('/')) return;
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  url(key: string): string {
    if (key.startsWith('/')) return key; // legada de disco — repassa como veio
    return `${this.publicBaseUrl}/${key}`;
  }

  keyFor(urlOrKey: string): string {
    if (urlOrKey.startsWith('/')) {
      // Legada de disco (/uploads/...): casa com o padrão do adapter local.
      return urlOrKey.replace(/^\/uploads\//, '');
    }
    if (urlOrKey.startsWith(this.publicBaseUrl)) {
      return urlOrKey.slice(this.publicBaseUrl.length + 1);
    }
    return urlOrKey;
  }

  /** Chave canônica: aplica o prefixo de ambiente quando ausente. */
  private withPrefix(key: string): string {
    return key.startsWith(`${this.keyPrefix}/`)
      ? key
      : `${this.keyPrefix}/${key.replace(/^\//, '')}`;
  }

  async onModuleDestroy(): Promise<void> {
    this.client.destroy();
  }
}

export interface S3AdapterConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  publicBaseUrl: string;
  /** Prefixo de ambiente (dev/prod); default deriva de NODE_ENV. */
  keyPrefix?: string;
}
