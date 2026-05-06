// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import crypto from 'node:crypto';
import type { Job } from 'bullmq';
import { eq, and } from 'drizzle-orm';
import { db, reservations, chargingStations, evses } from '@evtivity/database';
import type { PubSubClient } from '@evtivity/lib';
import { createLogger } from '@evtivity/lib';

const log = createLogger('reservation-activate');

export async function handleReservationActivate(job: Job, pubsub: PubSubClient): Promise<void> {
  const { reservationDbId } = job.data as { reservationDbId: string };

  // Load reservation with station and EVSE info
  const [reservation] = await db
    .select({
      id: reservations.id,
      reservationId: reservations.reservationId,
      status: reservations.status,
      expiresAt: reservations.expiresAt,
      driverId: reservations.driverId,
      stationDbId: reservations.stationId,
      stationOcppId: chargingStations.stationId,
      isOnline: chargingStations.isOnline,
      ocppProtocol: chargingStations.ocppProtocol,
      evseDbId: reservations.evseId,
    })
    .from(reservations)
    .innerJoin(chargingStations, eq(reservations.stationId, chargingStations.id))
    .where(eq(reservations.id, reservationDbId));

  if (reservation == null) {
    log.warn({ reservationDbId }, 'Reservation not found, skipping activation');
    return;
  }

  if (reservation.status !== 'scheduled') {
    log.info(
      { reservationDbId, status: reservation.status },
      'Reservation is no longer scheduled, skipping activation',
    );
    return;
  }

  // Check if already expired
  if (reservation.expiresAt <= new Date()) {
    await db
      .update(reservations)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(reservations.id, reservationDbId));
    log.info({ reservationDbId }, 'Scheduled reservation expired before activation');
    return;
  }

  // Check station is online
  if (!reservation.isOnline) {
    await db
      .update(reservations)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(reservations.id, reservationDbId));
    log.warn(
      { reservationDbId, stationId: reservation.stationOcppId },
      'Station offline, cancelling scheduled reservation',
    );
    return;
  }

  // Resolve EVSE OCPP integer ID if an EVSE is assigned
  let evseOcppId: number | undefined;
  if (reservation.evseDbId != null) {
    const [evse] = await db
      .select({ evseId: evses.evseId })
      .from(evses)
      .where(eq(evses.id, reservation.evseDbId));
    if (evse != null) {
      evseOcppId = evse.evseId;
    }
  }

  // Build and send ReserveNow command
  const commandId = crypto.randomUUID();
  const ocppPayload: Record<string, unknown> = {
    id: reservation.reservationId,
    expiryDateTime: reservation.expiresAt.toISOString(),
    idToken: {
      idToken: reservation.driverId ?? 'operator',
      type: 'Central',
    },
  };
  if (evseOcppId != null) {
    ocppPayload['evseId'] = evseOcppId;
  }

  // Do NOT include `version` here. CommandListener treats a present `version`
  // as "caller already shaped the payload for that wire protocol -- skip
  // translation". This payload is in OCPP 2.1 form (id/evseId/idToken object/
  // expiryDateTime); for an OCPP 1.6 station those fields must be translated
  // to reservationId/connectorId/idTag/expiryDate. Omitting `version` routes
  // through `sendVersionAwareCommand`, which looks up the station's actual
  // protocol from the open connection and applies the right mapper.
  const notification = JSON.stringify({
    commandId,
    stationId: reservation.stationOcppId,
    action: 'ReserveNow',
    payload: ocppPayload,
  });

  // Flip status BEFORE publish so retries can't double-send. The guarded
  // update only succeeds when the row is still 'scheduled'; on retry after a
  // partial failure we'll see status='active' and skip the publish entirely.
  // BullMQ jobId dedup already guards against duplicate enqueues, but worker
  // retries (attempts: 3 in reservation-worker) can re-run the handler.
  const updated = await db
    .update(reservations)
    .set({ status: 'active', updatedAt: new Date() })
    .where(and(eq(reservations.id, reservationDbId), eq(reservations.status, 'scheduled')))
    .returning({ id: reservations.id });

  if (updated.length === 0) {
    log.info(
      { reservationDbId },
      'Reservation already activated (or no longer scheduled); skipping ReserveNow publish',
    );
    return;
  }

  await pubsub.publish('ocpp_commands', notification);

  log.info(
    {
      reservationDbId,
      stationId: reservation.stationOcppId,
      reservationId: reservation.reservationId,
    },
    'Scheduled reservation activated and ReserveNow sent',
  );
}
