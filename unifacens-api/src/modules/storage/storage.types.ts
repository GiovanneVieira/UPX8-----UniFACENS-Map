/**
 * Interface do seam de armazenamento de arquivos (ports & adapters).
 *
 * Dois adapters justificam o seam:
 *  - S3 (produção): objetos públicos de leitura, URL via S3_PUBLIC_BASE_URL.
 *  - Disco local (dev/testes): grava sob uploads/ e serve via /uploads.
 *
 * Contrato de chaves: a chave é lógica e escopada por pasta sugestiva:
 *   points/images/{anchorId}/{uuid}.{ext}
 *   models/originals/{modelId}/{slug}.{ext}
 *   models/derived/{modelId}/{slug}.glb
 * A URL devolvida pode ser absoluta (S3) ou relativa à origem da API
 * (`/uploads/...` no adapter local) — o client resolve com resolveAssetUrl.
 */

export interface StoredObject {
  key: string;
  url: string;
}

export interface StorageAdapter {
  readonly driver: 's3' | 'local';
  put(key: string, buffer: Buffer, contentType: string): Promise<StoredObject>;
  delete(key: string): Promise<void>;
  url(key: string): string;
  /** Inverso de url(): recupera a chave lógica de uma URL serializada. */
  keyFor(urlOrKey: string): string;
}

export const STORAGE = Symbol('STORAGE');

/** Prefixo das chaves legadas gravadas em disco antes do S3. */
export const LEGACY_UPLOADS_PREFIX = '/uploads/';

/** Construtores de chave — pastas sugestivas do bucket (SSOT). */
export const storageKeys = {
  pointImage: (anchorId: string, filename: string) =>
    `points/images/${anchorId}/${filename}`,
  modelOriginal: (modelId: string, filename: string) =>
    `models/originals/${modelId}/${filename}`,
  modelDerived: (modelId: string, filename: string) =>
    `models/derived/${modelId}/${filename}`,
} as const;

/** Rejeita path traversal em chaves vindas de fora (ex.: delete por query). */
export function assertSafeKey(key: string): void {
  if (key.includes('..') || key.startsWith('/') || key.includes('\\')) {
    throw new Error('Chave de armazenamento inválida.');
  }
  if (!/^[\w\-./]+$/.test(key)) {
    throw new Error('Chave de armazenamento inválida.');
  }
}
