import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  categorySchema,
  type Category,
  type CreateCategoryDto,
  type UpdateCategoryDto,
} from 'shared';
import { CategoriesRepository } from './categories.repository.js';
import { STORAGE, type StorageAdapter } from '../storage/storage.types.js';
import { DRIZZLE, type DrizzleDB } from '../../db/database.module.js';
import { models } from '../../db/schema.js';
import {
  DuplicatedRecordException,
  RecordInUseException,
} from '../../common/exceptions/domain.exceptions.js';

/**
 * Serviço de categorias: o domínio do vínculo categoria↔modelo (categoria
 * mandante). Serializa com a URL pública do modelo resolvida pelo storage.
 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly repository: CategoriesRepository,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  async list(): Promise<Category[]> {
    const rows = await this.repository.list();
    return rows.map((row) => categorySchema.parse(this.serialize(row)));
  }

  async create(dto: CreateCategoryDto) {
    await this.assertModelExists(dto.modelId ?? null);
    const duplicated = await this.repository.findBySlug(dto.slug);
    if (duplicated) {
      throw new DuplicatedRecordException(
        `Já existe uma categoria com o identificador "${dto.slug}".`,
      );
    }
    const row = await this.repository.create({
      slug: dto.slug,
      label: dto.label,
      sort: dto.sort,
      modelId: dto.modelId ?? null,
    });
    return this.findOrThrow(row.id);
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Categoria não encontrada.');
    if (dto.modelId !== undefined) await this.assertModelExists(dto.modelId);
    if (dto.slug && dto.slug !== existing.slug) {
      const duplicated = await this.repository.findBySlug(dto.slug);
      if (duplicated) {
        throw new DuplicatedRecordException(
          `Já existe uma categoria com o identificador "${dto.slug}".`,
        );
      }
    }
    const updated = await this.repository.update(id, {
      ...(dto.label !== undefined ? { label: dto.label } : {}),
      ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
      ...(dto.sort !== undefined ? { sort: dto.sort } : {}),
      ...(dto.modelId !== undefined ? { modelId: dto.modelId } : {}),
    });
    if (!updated) throw new NotFoundException('Categoria não encontrada.');
    return this.findOrThrow(updated.id);
  }

  /** Categoria em uso por local ou ponto AR não pode ser excluída (409). */
  async remove(id: string) {
    const usage = await this.repository.usageCount(id);
    if (usage.places > 0 || usage.anchors > 0) {
      const parts = [
        usage.places > 0 ? `${usage.places} local(is)` : null,
        usage.anchors > 0 ? `${usage.anchors} ponto(s) AR` : null,
      ].filter(Boolean);
      throw new RecordInUseException(
        `Categoria em uso por ${parts.join(' e ')}. Desvincule antes de excluir.`,
      );
    }
    const removed = await this.repository.remove(id);
    if (!removed) throw new NotFoundException('Categoria não encontrada.');
    return { success: true };
  }

  private async findOrThrow(id: string): Promise<Category> {
    const all = await this.repository.list();
    const row = all.find((category) => category.id === id);
    if (!row) throw new NotFoundException('Categoria não encontrada.');
    return categorySchema.parse(this.serialize(row));
  }

  private async assertModelExists(modelId: string | null) {
    if (!modelId) return;
    const [row] = await this.db
      .select({ id: models.id })
      .from(models)
      .where(eq(models.id, modelId))
      .limit(1);
    if (!row) {
      throw new NotFoundException(
        'Modelo não encontrado. Envie o arquivo antes de vincular.',
      );
    }
  }

  private serialize(row: Awaited<ReturnType<CategoriesRepository['list']>>[number]) {
    const renderableKey = row.model?.derivedKey ?? row.model?.originalKey ?? null;
    const renderableFormat =
      row.model && row.model.derivedKey ? 'glb' : row.model?.format;
    return {
      id: row.id,
      slug: row.slug,
      label: row.label,
      sort: row.sort,
      modelId: row.model?.id ?? null,
      model:
        row.model && renderableKey
          ? {
              url: this.storage.url(renderableKey),
              format: renderableFormat as 'glb' | 'gltf' | 'obj' | 'fbx' | 'vrx',
            }
          : null,
    };
  }
}
