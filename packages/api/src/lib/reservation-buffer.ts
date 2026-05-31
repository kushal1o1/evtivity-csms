// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { and, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { db, getReservationSettings, reservations } from '@evtivity/database';

/**
 * Returns true if the given EVSE has a scheduled or active reservation whose
 * effective start time (startsAt, falling back to createdAt) falls within the
 * configured buffer window from now.
 *
 * When bufferMinutes is 0, the check is skipped and false is returned.
 * Station-wide reservations (evseId IS NULL) match every EVSE on the station.
 */
export async function isEvseInReservationBuffer(
  stationDbId: string,
  evseDbId: string | null,
): Promise<boolean> {
  const config = await getReservationSettings();
  if (config.bufferMinutes <= 0) return false;

  const now = new Date();
  const bufferCutoff = new Date(now.getTime() + config.bufferMinutes * 60_000);

  const conditions = [
    eq(reservations.stationId, stationDbId),
    // Pre-activation reservations are 'scheduled'; the worker flips to 'active' at startsAt.
    inArray(reservations.status, ['scheduled', 'active']),
    gte(reservations.expiresAt, now),
    sql`COALESCE(${reservations.startsAt}, ${reservations.createdAt}) <= ${bufferCutoff}`,
    sql`COALESCE(${reservations.startsAt}, ${reservations.createdAt}) >= ${now}`,
  ];

  if (evseDbId != null) {
    conditions.push(or(eq(reservations.evseId, evseDbId), isNull(reservations.evseId)) as SQL);
  }

  const rows = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(and(...conditions))
    .limit(1);

  return rows.length > 0;
}
