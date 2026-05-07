// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { users } from './identity.js';

export const stationMessageTemplates = pgTable('station_message_templates', {
  id: serial('id').primaryKey(),
  state: varchar('state', { length: 20 }).notNull().unique(),
  body: text('body').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
});
