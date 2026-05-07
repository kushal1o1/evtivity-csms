// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  varchar,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { chargingStations } from './assets.js';

export const stationMessagePushes = pgTable(
  'station_message_pushes',
  {
    id: serial('id').primaryKey(),
    stationId: text('station_id')
      .notNull()
      .references(() => chargingStations.id, { onDelete: 'cascade' }),
    state: varchar('state', { length: 20 }).notNull(),
    ocppMessageId: integer('ocpp_message_id').notNull(),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    pushedAt: timestamp('pushed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uniq_message_push_per_slot').on(table.stationId, table.ocppMessageId)],
);
