import { Inject, Injectable } from '@nestjs/common';
import { count, desc, eq, ilike, or } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../db/database.module.js';
import { anchors, categories, models, user } from '../../db/schema.js';
import type { AdminListQuery, UpdateAdminPoint } from 'shared';

@Injectable()
export class AdminRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** Pontos (âncoras) com categoria+modelo em UM join — sem N+1. */
  async listPoints(query: AdminListQuery) {
    const search = query.search.replace(/[\\%_]/g, '\\$&');
    const where = query.search
      ? or(
          ilike(anchors.name, `%${search}%`),
          ilike(anchors.description, `%${search}%`),
        )
      : undefined;
    const [items, totals] = await Promise.all([
      this.db
        .select({
          anchor: anchors,
          categoryId: categories.id,
          categorySlug: categories.slug,
          categoryLabel: categories.label,
          modelId: models.id,
          modelKey: models.originalKey,
          modelDerivedKey: models.derivedKey,
          modelFormat: models.format,
        })
        .from(anchors)
        .leftJoin(categories, eq(anchors.categoryId, categories.id))
        .leftJoin(models, eq(categories.modelId, models.id))
        .where(where)
        .orderBy(desc(anchors.createdAt), anchors.id)
        .limit(query.limit)
        .offset(query.offset),
      this.db.select({ total: count() }).from(anchors).where(where),
    ]);
    return { items, total: totals[0].total };
  }

  /** Ponto único com categoria+modelo (mesmo shape do listPoints). */
  async findPointById(id: string) {
    const [row] = await this.db
      .select({
        anchor: anchors,
        categoryId: categories.id,
        categorySlug: categories.slug,
        categoryLabel: categories.label,
        modelId: models.id,
        modelKey: models.originalKey,
        modelDerivedKey: models.derivedKey,
        modelFormat: models.format,
      })
      .from(anchors)
      .leftJoin(categories, eq(anchors.categoryId, categories.id))
      .leftJoin(models, eq(categories.modelId, models.id))
      .where(eq(anchors.id, id))
      .limit(1);
    return row ?? null;
  }

  async updatePoint(id: string, dto: UpdateAdminPoint) {
    const [record] = await this.db
      .update(anchors)
      .set(dto)
      .where(eq(anchors.id, id))
      .returning();
    return record;
  }

  async listUsers(query: AdminListQuery) {
    const search = query.search.replace(/[\\%_]/g, '\\$&');
    const where = query.search
      ? or(ilike(user.name, `%${search}%`), ilike(user.email, `%${search}%`))
      : undefined;
    const [items, totals] = await Promise.all([
      this.db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          emailVerified: user.emailVerified,
          banned: user.banned,
          createdAt: user.createdAt,
        })
        .from(user)
        .where(where)
        .orderBy(desc(user.createdAt), user.id)
        .limit(query.limit)
        .offset(query.offset),
      this.db.select({ total: count() }).from(user).where(where),
    ]);
    return { items, total: totals[0].total };
  }
}

/** Shape do row de ponto com categoria (devolvido por listPoints). */
export type AdminPointRow = Awaited<ReturnType<AdminRepository['listPoints']>>['items'][number];
