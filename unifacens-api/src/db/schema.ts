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
  primaryKey,
  foreignKey,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { NavigationEdge, NavigationNode } from 'shared';

// ─────────────────────────────────────────────────────────────────────────────
// Modelos 3D e categorias (CRUD do painel administrativo).
// Categoria é a mandante da relação 1:1 com o modelo (categories.model_id).
// ─────────────────────────────────────────────────────────────────────────────

/** Modelo 3D publicado (arquivo no S3 + metadados). FBX gera um GLB derivado. */
export const models = pgTable(
  'models',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    format: text('format').notNull(),
    /** Chave lógica no storage (ex.: models/originals/<id>/<slug>.fbx). */
    originalKey: text('original_key').notNull(),
    /** Chave do GLB derivado (apenas quando format = 'fbx'). */
    derivedKey: text('derived_key'),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      'models_format_values',
      sql`${table.format} IN ('glb', 'gltf', 'obj', 'fbx', 'vrx')`,
    ),
    check('models_size_positive', sql`${table.sizeBytes} > 0`),
  ],
);

/** Categorias de locais e pontos AR — ex-enum hardcoded, agora gerenciável. */
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull(),
    label: text('label').notNull(),
    sort: integer('sort').notNull().default(0),
    /** Categoria mandante: o modelo que o pin AR da categoria renderiza. */
    modelId: uuid('model_id').references(() => models.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('categories_slug_key').on(table.slug),
    check(
      'categories_slug_format',
      sql`${table.slug} ~ '^[a-z0-9]+([-_][a-z0-9]+)*$'`,
    ),
    check('categories_label_not_blank', sql`length(trim(${table.label})) > 0`),
  ],
);

export const anchors = pgTable('anchors', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  cloudAnchorId: text('cloud_anchor_id').notNull(),
  description: text('description'),
  longDescription: text('long_description'),
  images: jsonb('images').$type<string[]>().default([]),
  placeId: uuid('place_id'),
  /** Categoria do ponto — define o modelo 3D renderizado no AR. */
  categoryId: uuid('category_id').references(() => categories.id, {
    onDelete: 'restrict',
  }),
  positionX: doublePrecision('position_x'),
  positionY: doublePrecision('position_y'),
  positionZ: doublePrecision('position_z'),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  altitude: doublePrecision('altitude'),
  heading: doublePrecision('heading'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => [index('anchors_category_idx').on(table.categoryId)]);

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
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
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
    index('places_category_idx').on(table.categoryId),
    index('places_name_idx').on(table.name),
    index('places_coordinates_idx').on(table.latitude, table.longitude),
    check('places_latitude_range', sql`${table.latitude} BETWEEN -90 AND 90`),
    check(
      'places_longitude_range',
      sql`${table.longitude} BETWEEN -180 AND 180`,
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

/** Origem dos dados é estável entre versões; demonstração não vira levantamento. */
export const navigationNetworks = pgTable(
  'navigation_networks',
  {
    id: text('id').primaryKey(),
    dataSource: text('data_source').notNull(),
  },
  (table) => [
    check(
      'navigation_networks_source_check',
      sql`${table.dataSource} IN ('demo', 'field_survey')`,
    ),
  ],
);

/** Geometria/condições de uma versão não são editadas; revisão publica uma vez. */
export const navigationVersions = pgTable(
  'navigation_versions',
  {
    networkId: text('network_id')
      .notNull()
      .references(() => navigationNetworks.id, { onDelete: 'cascade' }),
    version: text('version').notNull(),
    status: text('status').notNull().default('draft'),
    nodeCount: integer('node_count').notNull(),
    edgeCount: integer('edge_count').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdByUserId: text('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    publishedByUserId: text('published_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    primaryKey({ columns: [table.networkId, table.version] }),
    index('navigation_versions_status_idx').on(table.status, table.createdAt),
    uniqueIndex('navigation_versions_active_idx')
      .on(table.networkId)
      .where(sql`${table.status} = 'published'`),
    check(
      'navigation_versions_status_check',
      sql`(${table.status} = 'draft' AND ${table.publishedAt} IS NULL AND ${table.retiredAt} IS NULL) OR (${table.status} = 'published' AND ${table.publishedAt} IS NOT NULL AND ${table.retiredAt} IS NULL) OR (${table.status} = 'retired' AND ${table.publishedAt} IS NOT NULL AND ${table.retiredAt} IS NOT NULL)`,
    ),
    check(
      'navigation_versions_counts_check',
      sql`${table.nodeCount} > 0 AND ${table.nodeCount} <= 1000 AND ${table.edgeCount} >= 0 AND ${table.edgeCount} <= 1000`,
    ),
  ],
);

export const navigationNodes = pgTable(
  'navigation_nodes',
  {
    networkId: text('network_id').notNull(),
    version: text('version').notNull(),
    id: text('id').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    position: jsonb('position').$type<NavigationNode['position']>(),
    anchorId: uuid('anchor_id').references(() => anchors.id, { onDelete: 'set null' }),
  },
  (table) => [
    primaryKey({ columns: [table.networkId, table.version, table.id] }),
    uniqueIndex('navigation_nodes_anchor_version_key').on(table.networkId, table.version, table.anchorId).where(sql`${table.anchorId} IS NOT NULL`),
    index('navigation_nodes_anchor_idx').on(table.anchorId),
    foreignKey({
      columns: [table.networkId, table.version],
      foreignColumns: [
        navigationVersions.networkId,
        navigationVersions.version,
      ],
    }).onDelete('cascade'),
    check(
      'navigation_nodes_kind_check',
      sql`${table.kind} IN ('gate', 'junction', 'building_access', 'reference')`,
    ),
    check('navigation_nodes_name_check', sql`length(trim(${table.name})) > 0`),
    check(
      'navigation_nodes_position_check',
      sql`${table.position} IS NULL OR jsonb_typeof(${table.position}) = 'object'`,
    ),
  ],
);

export const navigationEdges = pgTable(
  'navigation_edges',
  {
    networkId: text('network_id').notNull(),
    version: text('version').notNull(),
    id: text('id').notNull(),
    fromNodeId: text('from_node_id').notNull(),
    toNodeId: text('to_node_id').notNull(),
    kind: text('kind').notNull(),
    lengthMeters: doublePrecision('length_meters').notNull(),
    widthMeters: doublePrecision('width_meters'),
    longitudinalSlopePercent: doublePrecision('longitudinal_slope_percent'),
    crossSlopePercent: doublePrecision('cross_slope_percent'),
    stepCount: integer('step_count'),
    hasHandrail: boolean('has_handrail'),
    hasTactilePaving: boolean('has_tactile_paving'),
    surface: text('surface'),
    verification: jsonb('verification')
      .$type<NavigationEdge['verification']>()
      .notNull()
      .default({ status: 'unverified' }),
    availability: jsonb('availability')
      .$type<NavigationEdge['availability']>()
      .notNull()
      .default({ status: 'unknown' }),
  },
  (table) => [
    primaryKey({ columns: [table.networkId, table.version, table.id] }),
    foreignKey({
      columns: [table.networkId, table.version],
      foreignColumns: [
        navigationVersions.networkId,
        navigationVersions.version,
      ],
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.networkId, table.version, table.fromNodeId],
      foreignColumns: [
        navigationNodes.networkId,
        navigationNodes.version,
        navigationNodes.id,
      ],
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.networkId, table.version, table.toNodeId],
      foreignColumns: [
        navigationNodes.networkId,
        navigationNodes.version,
        navigationNodes.id,
      ],
    }).onDelete('cascade'),
    index('navigation_edges_from_idx').on(
      table.networkId,
      table.version,
      table.fromNodeId,
    ),
    index('navigation_edges_to_idx').on(
      table.networkId,
      table.version,
      table.toNodeId,
    ),
    check(
      'navigation_edges_kind_check',
      sql`${table.kind} IN ('walkway', 'footbridge', 'ramp', 'stairs', 'elevator', 'platform')`,
    ),
    check(
      'navigation_edges_length_check',
      sql`${table.lengthMeters} > 0 AND ${table.lengthMeters} < 'Infinity'::float8`,
    ),
    check(
      'navigation_edges_width_check',
      sql`${table.widthMeters} IS NULL OR (${table.widthMeters} > 0 AND ${table.widthMeters} < 'Infinity'::float8)`,
    ),
    check(
      'navigation_edges_longitudinal_check',
      sql`${table.longitudinalSlopePercent} IS NULL OR abs(${table.longitudinalSlopePercent}) < 'Infinity'::float8`,
    ),
    check(
      'navigation_edges_cross_check',
      sql`${table.crossSlopePercent} IS NULL OR (${table.crossSlopePercent} >= 0 AND ${table.crossSlopePercent} < 'Infinity'::float8)`,
    ),
    check(
      'navigation_edges_steps_check',
      sql`(${table.stepCount} IS NULL OR ${table.stepCount} >= 0) AND (${table.kind} <> 'stairs' OR ${table.stepCount} IS NULL OR ${table.stepCount} > 0)`,
    ),
    check(
      'navigation_edges_surface_check',
      sql`${table.surface} IS NULL OR ${table.surface} IN ('firm_regular', 'uneven', 'loose')`,
    ),
    check(
      'navigation_edges_verification_check',
      sql`COALESCE(jsonb_typeof(${table.verification}) = 'object' AND ${table.verification}->>'status' IN ('unverified', 'verified'), false)`,
    ),
    check(
      'navigation_edges_availability_check',
      sql`COALESCE(jsonb_typeof(${table.availability}) = 'object' AND ${table.availability}->>'status' IN ('unknown', 'open', 'closed'), false)`,
    ),
  ],
);
