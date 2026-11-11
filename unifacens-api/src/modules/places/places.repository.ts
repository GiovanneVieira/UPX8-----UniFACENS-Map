import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, ilike, or, type SQL } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../db/database.module.js';
import { categories, places } from '../../db/schema.js';
import {
  placeSchema,
  type CreatePlaceDto,
  type Place,
  type PlacesPage,
  type PlacesQuery,
  type UpdatePlaceDto,
} from 'shared';

const columns = {
  id: places.id,
  name: places.name,
  categoryId: places.categoryId,
  latitude: places.latitude,
  longitude: places.longitude,
  building: places.building,
  floor: places.floor,
  description: places.description,
  source: places.source,
  verificationStatus: places.verificationStatus,
  verifiedAt: places.verifiedAt,
  createdAt: places.createdAt,
  updatedAt: places.updatedAt,
};

type PlaceRow = {
  id: string;
  name: string;
  categoryId: string;
  latitude: number;
  longitude: number;
  building: string | null;
  floor: number | null;
  description: string | null;
  source: string;
  verificationStatus: string;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  categorySlug: string | null;
  categoryLabel: string | null;
};

function serialize(row: PlaceRow): Place {
  // placeSchema é strictObject: as colunas do join saem antes do parse.
  const { categorySlug, categoryLabel, ...rest } = row;
  return placeSchema.parse({
    ...rest,
    category: {
      id: row.categoryId,
      slug: categorySlug ?? '',
      label: categoryLabel ?? '',
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
  });
}

/** Select base com a categoria embutida em UM join (sem N+1). */
function selectWithCategory(db: DrizzleDB) {
  return db
    .select({ ...columns, categorySlug: categories.slug, categoryLabel: categories.label })
    .from(places)
    .innerJoin(categories, eq(places.categoryId, categories.id));
}

@Injectable()
export class PlacesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findAll(query: PlacesQuery): Promise<PlacesPage> {
    const filters: SQL[] = [];
    // Filtro canônico por id; slug aceito por compatibilidade (seeds).
    if (query.categoryId) filters.push(eq(places.categoryId, query.categoryId));
    else if (query.category) filters.push(eq(categories.slug, query.category));
    if (query.search) {
      const pattern = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
      const search = or(
        ilike(places.name, pattern),
        ilike(places.building, pattern),
      );
      if (search) filters.push(search);
    }
    // Uma transação mantém total e página consistentes sob alterações concorrentes.
    return this.db.transaction(
      async (tx) => {
        const records = await selectWithCategory(tx)
          .where(and(...filters))
          .orderBy(asc(places.name), asc(places.id))
          .limit(query.limit)
          .offset(query.offset);
        const [result] = await tx
          .select({ total: count() })
          .from(places)
          .innerJoin(categories, eq(places.categoryId, categories.id))
          .where(and(...filters));
        return { items: records.map(serialize), total: result?.total ?? 0 };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async findById(id: string): Promise<Place | null> {
    const [record] = await selectWithCategory(this.db)
      .where(eq(places.id, id))
      .limit(1);
    return record ? serialize(record) : null;
  }

  async findBySlug(slug: string) {
    const [row] = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, slug))
      .limit(1);
    return row ?? null;
  }

  async categoryExists(id: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);
    return Boolean(row);
  }

  async create(dto: CreatePlaceDto): Promise<Place> {
    const [record] = await this.db
      .insert(places)
      .values(dto)
      .returning({ id: places.id });
    return this.findById(record.id) as Promise<Place>;
  }

  async update(id: string, dto: UpdatePlaceDto): Promise<Place | null> {
    // Editar informações invalida qualquer verificação anterior.
    await this.db
      .update(places)
      .set({
        ...dto,
        updatedAt: new Date(),
        verificationStatus: 'unverified',
        verifiedAt: null,
      })
      .where(eq(places.id, id));
    return this.findById(id);
  }

  async remove(id: string): Promise<boolean> {
    const records = await this.db
      .delete(places)
      .where(eq(places.id, id))
      .returning({ id: places.id });
    return records.length > 0;
  }
}
