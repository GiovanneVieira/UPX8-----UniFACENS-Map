import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@nestjs/common';
import {
  LEGACY_UPLOADS_PREFIX,
  type StorageAdapter,
  type StoredObject,
} from './storage.types.js';

/** Prefixo por ambiente: STORAGE_PREFIX sobrepõe; prod em produção, dev caso contrário. */
export function defaultKeyPrefix(): string {
  return (
    process.env.STORAGE_PREFIX ||
    (process.env.NODE_ENV === 'production' ? 'prod' : 'dev')
  );
}

/**
 * Adapter de disco local (dev + testes). Grava sob STORAGE_LOCAL_ROOT
 * (default: unifacens-api/uploads) e devolve URLs relativas `/uploads/<key>`,
 * servidas pelo express.static do main.ts. O client resolve a origem.
 *
 * keyPrefix (dev/prod) isola arquivos por ambiente — detalhe INTERNO do
 * adapter: callers só conhecem chaves lógicas (points/images/...); put()
 * devolve a chave canônica já prefixada, e é ela que persiste no banco.
 * Chaves legadas (sem prefixo, prÉ-migração) continuam resolvendo no
 * caminho original — url()/delete() refletem a chave como veio.
 */
@Injectable()
export class LocalStorageAdapter implements StorageAdapter {
  readonly driver = 'local' as const;
  private readonly root: string;
  private readonly keyPrefix: string;

  constructor(root?: string, keyPrefix: string = defaultKeyPrefix()) {
    this.root = root ?? process.env.STORAGE_LOCAL_ROOT ?? defaultUploadsRoot();
    this.keyPrefix = keyPrefix;
  }

  async put(
    key: string,
    buffer: Buffer,
    _contentType: string,
  ): Promise<StoredObject> {
    const canonical = this.withPrefix(key);
    const target = this.resolve(canonical);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buffer);
    return { key: canonical, url: this.url(canonical) };
  }

  async delete(key: string): Promise<void> {
    const target = this.resolve(
      key.startsWith(LEGACY_UPLOADS_PREFIX)
        ? key.slice(LEGACY_UPLOADS_PREFIX.length)
        : key,
    );
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }

  url(key: string): string {
    if (key.startsWith(LEGACY_UPLOADS_PREFIX)) return key;
    return `${LEGACY_UPLOADS_PREFIX}${key}`;
  }

  keyFor(urlOrKey: string): string {
    if (urlOrKey.startsWith(LEGACY_UPLOADS_PREFIX))
      return urlOrKey.slice(LEGACY_UPLOADS_PREFIX.length);
    return urlOrKey;
  }

  /** Chave canônica: aplica o prefixo de ambiente quando ausente. */
  private withPrefix(key: string): string {
    const stripped = key.startsWith(LEGACY_UPLOADS_PREFIX)
      ? key.slice(LEGACY_UPLOADS_PREFIX.length)
      : key;
    return stripped.startsWith(`${this.keyPrefix}/`)
      ? stripped
      : `${this.keyPrefix}/${stripped}`;
  }

  /** Resolve a chave para caminho absoluto dentro do root (sem escape). */
  private resolve(key: string): string {
    const target = path.resolve(this.root, key);
    if (!target.startsWith(path.resolve(this.root))) {
      throw new Error('Chave de armazenamento inválida.');
    }
    return target;
  }
}

function defaultUploadsRoot(): string {
  // src/modules/storage/ → unifacens-api/uploads (mesma raiz do main.ts).
  return path.resolve(new URL('../../../uploads', import.meta.url).pathname);
}
