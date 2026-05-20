// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { db, settings, AUDIT_TABLES } from '@evtivity/database';
import { eq } from 'drizzle-orm';
import type { Logger } from '@evtivity/lib';
import { pruneOldRows } from '../lib/prune-old-rows.js';

const DEFAULT_RETENTION_DAYS = 1095;

// Daily cron: deletes audit rows older than `audit.retentionDays` from every
// table in AUDIT_TABLES plus the OCPP authorize-attempts log (which records
// every Authorize call and shares the same retention semantics). The
// retention setting is read fresh each run so operator changes take effect
// on the next schedule.
export async function auditRetentionPruneHandler(log: Logger): Promise<void> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, 'audit.retentionDays'))
    .limit(1);
  const raw = row?.value;
  const retentionDays = typeof raw === 'number' ? raw : DEFAULT_RETENTION_DAYS;
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    log.info({ retentionDays }, 'audit-retention-prune: retention disabled, skipping');
    return;
  }

  // Every per-entity audit table is keyed by entity_type in AUDIT_TABLES.
  // We also prune authorize_attempts (anonymous OCPP authorize records;
  // not in AUDIT_TABLES because it isn't entity-scoped) on the same schedule.
  const tableNames = [
    ...Object.keys(AUDIT_TABLES).map((k) => `${k}_audit_log`),
    'authorize_attempts',
  ];

  let totalDeleted = 0;
  for (const tableName of tableNames) {
    const tableDeleted = await pruneOldRows({
      table: tableName,
      cutoffColumn: 'created_at',
      retentionDays,
      log,
    });
    totalDeleted += tableDeleted;
    if (tableDeleted > 0) {
      log.info({ tableName, deleted: tableDeleted }, 'audit-retention-prune: pruned audit rows');
    }
  }

  log.info({ retentionDays, totalDeleted }, 'audit-retention-prune complete');
}
