import { Inject, Injectable } from '@nestjs/common';
import { asc, count, eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../db/database.module.js';
import { anchors, categories, models, places } from '../../db/schema.js';

export interface CategoryWithModel {
  id: string;
  slug: string;
  label: string;
  sort: number;
  model: {
    id: string;
    name: string;
    format: string;
    originalKey: string;
    derivedKey: string | null;
  } | null;
}

/**
 * Repositório de categorias. Todas as leituras usam UM join com models —
 * nunca uma query por categoria (prevenção N+1, §5 do AGENTS.MD).
 */
@Injectable()
export class CategoriesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async list(): Promise<CategoryWithModel[]> {
    const rows = await this.db
      .select({
        id: categories.id,
        slug: categories.slug,
        label: categories.label,
        sort: categories.sort,
        modelId: models.id,
        modelName: models.name,
        modelFormat: models.format,
        modelOriginalKey: models.originalKey,
        modelDerivedKey: models.derivedKey,
      })
      .from(categories)
      .leftJoin(models, eq(categories.modelId, models.id))
      .orderBy(asc(categories.sort), asc(categories.label));
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      label: row.label,
      sort: row.sort,
      model: row.modelId
        ? {
            id: row.modelId,
            name: row.modelName as string,
            format: row.modelFormat as string,
            originalKey: row.modelOriginalKey as string,
            derivedKey: row.modelDerivedKey,
          }
        : null,
    }));
  }

  async findById(id: string) {
    const [row] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);
    return row ?? null;
  }

  async findBySlug(slug: string) {
    const [row] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.slug, slug))
      .limit(1);
    return row ?? null;
  }

  async create(values: {
    slug: string;
    label: string;
    sort: number;
    modelId: string | null;
  }) {
    const [row] = await this.db.insert(categories).values(values).returning();
    return row;
  }

  async update(
    id: string,
    values: Partial<{
      slug: string;
      label: string;
      sort: number;
      modelId: string | null;
    }>,
  ) {
    const [row] = await this.db
      .update(categories)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(categories.id, id))
      .returning();
    return row ?? null;
  }

  async remove(id: string) {
    const rows = await this.db
      .delete(categories)
      .where(eq(categories.id, id))
      .returning({ id: categories.id });
    return rows.length > 0;
  }

  /** Uso da categoria por locais e pontos AR (guard do delete). */
  async usageCount(id: string) {
    const [placeCount] = await this.db
      .select({ total: count() })
      .from(places)
      .where(eq(places.categoryId, id));
    const [anchorCount] = await this.db
      .select({ total: count() })
      .from(anchors)
      .where(eq(anchors.categoryId, id));
    return {
      places: placeCount?.total ?? 0,
      anchors: anchorCount?.total ?? 0,
    };
  }
}
