// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { pricingAuditLog } from '../schema/pricing.js';
import { db as defaultDb } from '../config.js';

export type PricingAuditEntity = 'pricing_group' | 'tariff' | 'holiday' | 'pricing_assignment';
export type PricingAuditAction = 'created' | 'updated' | 'deleted';

export interface WritePricingAuditArgs {
  entityType: PricingAuditEntity;
  entityId: string;
  action: PricingAuditAction;
  actorUserId?: string | null;
  before?: unknown;
  after?: unknown;
  notes?: string | null;
}

type AuditDb = Pick<typeof defaultDb, 'insert'>;

/**
 * Shared writer for `pricing_audit_log`. Every operator-initiated mutation on
 * a pricing group, tariff, or holiday goes through this so disputes can be
 * resolved against the exact tariff that applied at any point in time.
 *
 * Audit insert failures are logged via the optional logger and otherwise
 * swallowed -- the mutation that triggered the audit has already committed,
 * so propagating would surface a 5xx on a successful business operation.
 */
export async function writePricingAudit(
  args: WritePricingAuditArgs,
  db: AuditDb = defaultDb,
  logger?: { warn: (obj: unknown, msg?: string) => void },
): Promise<void> {
  try {
    await db.insert(pricingAuditLog).values({
      entityType: args.entityType,
      entityId: args.entityId,
      action: args.action,
      actorUserId: args.actorUserId ?? null,
      before: args.before ?? null,
      after: args.after ?? null,
      notes: args.notes ?? null,
    });
  } catch (err) {
    if (logger != null) {
      logger.warn(
        { err, entityType: args.entityType, entityId: args.entityId, action: args.action },
        'pricing audit insert failed (mutation already committed)',
      );
    }
  }
}
