// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { reservationAuditLog } from '../schema/reservations.js';
import { db as defaultDb } from '../config.js';

// Structural type covering both the pool-scoped db and a transaction handle.
// Both expose `insert(...)`; only the pool has `$client`. Typing the helper
// against the full pool type forces callers inside `db.transaction(tx => ...)`
// to cast, which obscures intent. Pick what we use.
type AuditDb = Pick<typeof defaultDb, 'insert'>;

export type ReservationAuditAction =
  | 'created'
  | 'updated'
  | 'cancelled'
  | 'expired'
  | 'used'
  | 'session_failed';

export type ReservationAuditActor = 'operator' | 'driver' | 'system';

export interface WriteReservationAuditArgs {
  reservationId: string;
  action: ReservationAuditAction;
  actor: ReservationAuditActor;
  actorUserId?: string | null;
  actorDriverId?: string | null;
  driverIdBefore?: string | null;
  driverIdAfter?: string | null;
  tokenIdBefore?: string | null;
  tokenIdAfter?: string | null;
  evseIdBefore?: string | null;
  evseIdAfter?: string | null;
  statusBefore?: string | null;
  statusAfter?: string | null;
  expiresAtBefore?: Date | null;
  expiresAtAfter?: Date | null;
  notes?: string | null;
}

/**
 * Shared writer for `reservation_audit_log`. Every package that mutates a
 * reservation (api, worker, ocpp) calls this so the audit log is the single
 * source of truth for reservation lifecycle events.
 *
 * Audit insert failures are logged via the optional logger and otherwise
 * swallowed -- the mutation that triggered the audit has already committed,
 * so propagating would surface a 5xx on a successful business operation.
 * Operators monitoring stderr/pino logs see the warn so disk-full or
 * schema-drift on reservation_audit_log doesn't go unnoticed.
 *
 * The optional db arg accepts a transaction-scoped Drizzle instance; default
 * uses the shared connection pool from @evtivity/database.
 */
export async function writeReservationAudit(
  args: WriteReservationAuditArgs,
  db: AuditDb = defaultDb,
  logger?: { warn: (obj: unknown, msg?: string) => void },
): Promise<void> {
  try {
    await db.insert(reservationAuditLog).values({
      reservationId: args.reservationId,
      action: args.action,
      actor: args.actor,
      actorUserId: args.actorUserId ?? null,
      actorDriverId: args.actorDriverId ?? null,
      driverIdBefore: args.driverIdBefore ?? null,
      driverIdAfter: args.driverIdAfter ?? null,
      tokenIdBefore: args.tokenIdBefore ?? null,
      tokenIdAfter: args.tokenIdAfter ?? null,
      evseIdBefore: args.evseIdBefore ?? null,
      evseIdAfter: args.evseIdAfter ?? null,
      statusBefore: args.statusBefore ?? null,
      statusAfter: args.statusAfter ?? null,
      expiresAtBefore: args.expiresAtBefore ?? null,
      expiresAtAfter: args.expiresAtAfter ?? null,
      notes: args.notes ?? null,
    });
  } catch (err) {
    if (logger != null) {
      logger.warn(
        { err, reservationId: args.reservationId, action: args.action },
        'reservation audit insert failed (mutation already committed)',
      );
    }
  }
}

/**
 * Return true when the PATCH diff actually changed at least one of the
 * audited fields. PATCH never mutates status (status transitions go through
 * cancel/expire/use code paths, not PATCH), so we don't compare it here --
 * a PATCH-induced status change is impossible by construction.
 */
export function reservationDiffChanged(
  before: {
    driverId?: string | null;
    tokenId?: string | null;
    evseId?: string | null;
    expiresAt?: Date | null;
  },
  after: {
    driverId?: string | null;
    tokenId?: string | null;
    evseId?: string | null;
    expiresAt?: Date | null;
  },
): boolean {
  const expiresBefore = before.expiresAt == null ? null : before.expiresAt.getTime();
  const expiresAfter = after.expiresAt == null ? null : after.expiresAt.getTime();
  return (
    (before.driverId ?? null) !== (after.driverId ?? null) ||
    (before.tokenId ?? null) !== (after.tokenId ?? null) ||
    (before.evseId ?? null) !== (after.evseId ?? null) ||
    expiresBefore !== expiresAfter
  );
}
