import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, ilike, or, type SQL } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../db/database.module.js';
import { places } from '../../db/schema.js';
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
  category: places.category,
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

function serialize(record: typeof places.$inferSelect): Place {
  return placeSchema.parse({
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    verifiedAt: record.verifiedAt?.toISOString() ?? null,
  });
}

@Injectable()
export class PlacesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findAll(query: PlacesQuery): Promise<PlacesPage> {
    const filters: SQL[] = [];
    if (query.category) filters.push(eq(places.category, query.category));
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
        const records = await tx
          .select(columns)
          .from(places)
          .where(and(...filters))
          .orderBy(asc(places.name), asc(places.id))
          .limit(query.limit)
          .offset(query.offset);
        const [result] = await tx
          .select({ total: count() })
          .from(places)
          .where(and(...filters));
        return { items: records.map(serialize), total: result?.total ?? 0 };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async findById(id: string): Promise<Place | null> {
    const [record] = await this.db
      .select(columns)
      .from(places)
      .where(eq(places.id, id))
      .limit(1);
    return record ? serialize(record) : null;
  }

  async create(dto: CreatePlaceDto): Promise<Place> {
    const [record] = await this.db
      .insert(places)
      .values(dto)
      .returning(columns);
    return serialize(record);
  }

  async update(id: string, dto: UpdatePlaceDto): Promise<Place | null> {
    // Editar informações invalida qualquer verificação anterior.
    const [record] = await this.db
      .update(places)
      .set({
        ...dto,
        updatedAt: new Date(),
        verificationStatus: 'unverified',
        verifiedAt: null,
      })
      .where(eq(places.id, id))
      .returning(columns);
    return record ? serialize(record) : null;
  }

  async remove(id: string): Promise<boolean> {
    const records = await this.db
      .delete(places)
      .where(eq(places.id, id))
      .returning({ id: places.id });
    return records.length > 0;
  }
}
