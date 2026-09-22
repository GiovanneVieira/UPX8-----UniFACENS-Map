import { pgTable, text, timestamp, uuid, doublePrecision } from 'drizzle-orm/pg-core';

export const anchors = pgTable('anchors', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  cloudAnchorId: text('cloud_anchor_id').notNull(),
  description: text('description'),
  positionX: doublePrecision('position_x'),
  positionY: doublePrecision('position_y'),
  positionZ: doublePrecision('position_z'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Anchor = typeof anchors.$inferSelect;
export type NewAnchor = typeof anchors.$inferInsert;
