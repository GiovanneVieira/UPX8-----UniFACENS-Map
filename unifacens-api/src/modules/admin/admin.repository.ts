import { Inject, Injectable } from '@nestjs/common';
import { count, desc, eq, ilike, or } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../db/database.module.js';
import { anchors, user } from '../../db/schema.js';
import type { AdminListQuery, UpdateAdminPoint } from 'shared';

@Injectable()
export class AdminRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

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
        .select()
        .from(anchors)
        .where(where)
        .orderBy(desc(anchors.createdAt), anchors.id)
        .limit(query.limit)
        .offset(query.offset),
      this.db.select({ total: count() }).from(anchors).where(where),
    ]);
    return { items, total: totals[0].total };
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
