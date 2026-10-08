import {
  pgTable,
  text,
  timestamp,
  uuid,
  doublePrecision,
  integer,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const anchors = pgTable('anchors', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  cloudAnchorId: text('cloud_anchor_id').notNull(),
  description: text('description'),
  positionX: doublePrecision('position_x'),
  positionY: doublePrecision('position_y'),
  positionZ: doublePrecision('position_z'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Anchor = typeof anchors.$inferSelect;
export type NewAnchor = typeof anchors.$inferInsert;

export const places = pgTable(
  'places',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    building: text('building'),
    floor: integer('floor'),
    description: text('description'),
    source: text('source').notNull().default('team_report'),
    verificationStatus: text('verification_status')
      .notNull()
      .default('unverified'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('places_category_idx').on(table.category),
    index('places_name_idx').on(table.name),
    index('places_coordinates_idx').on(table.latitude, table.longitude),
    check('places_latitude_range', sql`${table.latitude} BETWEEN -90 AND 90`),
    check(
      'places_longitude_range',
      sql`${table.longitude} BETWEEN -180 AND 180`,
    ),
    check(
      'places_category_values',
      sql`${table.category} IN ('building', 'classroom', 'laboratory', 'entrance', 'ramp', 'elevator', 'restroom', 'drinking_fountain', 'cafeteria', 'service', 'other')`,
    ),
    check(
      'places_source_values',
      sql`${table.source} IN ('team_report', 'field_survey', 'demo')`,
    ),
    check(
      'places_verification_values',
      sql`${table.verificationStatus} IN ('unverified', 'verified')`,
    ),
    check(
      'places_verification_evidence',
      sql`(${table.verificationStatus} = 'unverified' AND ${table.verifiedAt} IS NULL) OR (${table.verificationStatus} = 'verified' AND ${table.verifiedAt} IS NOT NULL)`,
    ),
  ],
);
