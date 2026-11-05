import {
  pgTable,
  text,
  timestamp,
  uuid,
  doublePrecision,
  integer,
  boolean,
  index,
  check,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const anchors = pgTable('anchors', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  cloudAnchorId: text('cloud_anchor_id').notNull(),
  description: text('description'),
  longDescription: text('long_description'),
  images: jsonb('images').$type<string[]>().default([]),
  placeId: uuid('place_id'),
  positionX: doublePrecision('position_x'),
  positionY: doublePrecision('position_y'),
  positionZ: doublePrecision('position_z'),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  altitude: doublePrecision('altitude'),
  heading: doublePrecision('heading'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Anchor = typeof anchors.$inferSelect;
export type NewAnchor = typeof anchors.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Tabelas do better-auth (e-mail/senha + plugins admin e jwt).
// Nomenclatura de colunas conforme convenção exigida pelo drizzleAdapter.
// ─────────────────────────────────────────────────────────────────────────────

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Admin plugin
  role: text('role').notNull().default('user'),
  banned: boolean('banned'),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires', { withTimezone: true }),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Admin plugin (impersonação)
  impersonatedBy: text('impersonated_by'),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
    withTimezone: true,
  }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Chaves públicas do plugin JWT (endpoint /auth/jwks)
export const jwks = pgTable('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key'),
  alg: text('alg'),
  crv: text('crv'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Malha caminhável do campus (C2 do plano de navegação AR)
// ─────────────────────────────────────────────────────────────────────────────

/** Obstáculos físicos do campus (footprints de prédios, água, áreas restritas). */
export const campusObstacles = pgTable('campus_obstacles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull().default('building'),
  polygon: jsonb('polygon').$type<Array<[number, number]>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Entradas de prédios — destinos privilegiados para navegação até a porta. */
export const campusEntrances = pgTable('campus_entrances', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  altitude: doublePrecision('altitude'),
  accessible: boolean('accessible').default(true),
  obstacleId: text('obstacle_id').references(() => campusObstacles.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
