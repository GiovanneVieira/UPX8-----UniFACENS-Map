import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import {
  MODEL_UPLOAD_LIMIT_BYTES,
  type Model,
  modelFormatSchema,
  type ModelFormat,
} from 'shared';
import { DRIZZLE, type DrizzleDB } from '../../db/database.module.js';
import { categories, models } from '../../db/schema.js';
import {
  STORAGE,
  storageKeys,
  type StorageAdapter,
} from '../storage/storage.types.js';
import { validateModelFile } from './model-file.js';
import {
  InvalidModelFileException,
  RecordInUseException,
  StorageFailureException,
  UploadSizeExceededException,
} from '../../common/exceptions/domain.exceptions.js';

const MIME_BY_FORMAT: Record<ModelFormat, string> = {
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  obj: 'text/plain',
  fbx: 'application/octet-stream',
  vrx: 'application/octet-stream',
};

export interface UploadModelInput {
  buffer: Buffer;
  originalname: string;
  size: number;
}

export interface ModelWithCategory extends Model {
  category: { id: string; label: string } | null;
}

/**
 * Pipeline de upload de modelos 3D: magic bytes → storage (models/originals/)
 * → linha no banco. FBX não é aceito (decisão 2026-11-11: sem conversão
 * server-side — recusamos com orientação de exportar GLB antes).
 */
@Injectable()
export class ModelsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  async upload(input: UploadModelInput): Promise<ModelWithCategory> {
    if (input.size > MODEL_UPLOAD_LIMIT_BYTES || input.buffer.length > MODEL_UPLOAD_LIMIT_BYTES) {
      throw new UploadSizeExceededException(
        'Arquivo excede 1 MB. Simplifique o modelo e tente novamente.',
      );
    }
    const extension = input.originalname.split('.').pop() ?? '';
    const baseName = input.originalname
      .replace(/\.[^.]+$/, '')
      .trim()
      .slice(0, 120);
    let format: ModelFormat;
    try {
      format = validateModelFile(input.buffer, extension).format;
    } catch (error) {
      throw new InvalidModelFileException(
        error instanceof Error ? error.message : 'Arquivo de modelo inválido.',
      );
    }

    const id = randomUUID();
    const fileSlug = slugify(baseName) || 'modelo';
    // put() devolve a chave CANÔNICA (com prefixo dev/|prod/) — é ela que
    // persiste; a chave lógica é só endereço de escrita. Falha de infra
    // (S3 fora, credencial ruim) → 503, não 500.
    const stored = await this.storage
      .put(
        storageKeys.modelOriginal(id, `${fileSlug}.${extension}`),
        input.buffer,
        MIME_BY_FORMAT[format],
      )
      .catch(() => {
        throw new StorageFailureException();
      });
    const originalKey = stored.key;

    const [row] = await this.db
      .insert(models)
      .values({
        id,
        name: baseName || `modelo-${id.slice(0, 8)}`,
        format,
        originalKey,
        derivedKey: null,
        sizeBytes: input.buffer.length,
      })
      .returning();
    return this.serialize(row, null);
  }

  async list(): Promise<{ items: ModelWithCategory[]; total: number }> {
    // UM join com categories — N+1 proibido (§5 AGENTS.MD).
    const rows = await this.db
      .select({
        model: models,
        categoryId: categories.id,
        categoryLabel: categories.label,
      })
      .from(models)
      .leftJoin(categories, eq(categories.modelId, models.id))
      .orderBy(desc(models.createdAt));
    return {
      items: rows.map((row) =>
        this.serialize(
          row.model,
          row.categoryId
            ? {
                id: row.categoryId,
                label: row.categoryLabel as string,
              }
            : null,
        ),
      ),
      total: rows.length,
    };
  }

  async remove(id: string) {
    const [row] = await this.db
      .select()
      .from(models)
      .where(eq(models.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('Modelo não encontrado.');

    const linked = await this.db
      .select({ id: categories.id, label: categories.label })
      .from(categories)
      .where(eq(categories.modelId, id));
    if (linked.length > 0) {
      throw new RecordInUseException(
        `Modelo vinculado à(s) categoria(s): ${linked
          .map((category) => category.label)
          .join(', ')}. Desvincule antes de excluir.`,
      );
    }

    await this.storage.delete(row.originalKey);
    if (row.derivedKey) await this.storage.delete(row.derivedKey);
    await this.db.delete(models).where(eq(models.id, id));
    return { success: true };
  }

  private serialize(
    row: typeof models.$inferSelect,
    category: { id: string; label: string } | null,
  ): ModelWithCategory {
    const format = modelFormatSchema.parse(row.format);
    const converted = row.derivedKey !== null;
    return {
      id: row.id,
      name: row.name,
      format,
      sizeBytes: row.sizeBytes,
      // Renderizável: GLB derivado quando a origem é FBX.
      url: this.storage.url(row.derivedKey ?? row.originalKey),
      originalUrl: this.storage.url(row.originalKey),
      converted,
      createdAt: row.createdAt.toISOString(),
      category,
    };
  }
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
