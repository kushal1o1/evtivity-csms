// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import crypto from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { client } from '@evtivity/database';
import { dispatchDriverNotification } from '@evtivity/lib';
import type { Logger } from 'pino';
import { getPubSub } from '@evtivity/api/src/lib/pubsub.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const API_TEMPLATES_DIR =
  process.env['API_TEMPLATES_DIR'] ??
  resolve(currentDir, '..', '..', '..', 'api', 'src', 'templates');
const OCPP_TEMPLATES_DIR =
  process.env['OCPP_TEMPLATES_DIR'] ??
  resolve(currentDir, '..', '..', '..', 'ocpp', 'src', 'templates');
const ALL_TEMPLATES_DIRS = [OCPP_TEMPLATES_DIR, API_TEMPLATES_DIR];

const EXPIRY_WARNING_MINUTES = 15;

interface ExpiredRow {
  id: string;
  driver_id: string | null;
  reservation_ocpp_id: number;
  station_ocpp_id: string;
}

interface ExpiringRow {
  id: string;
  driver_id: string | null;
  expires_at: Date;
}

export async function reservationExpiryCheckHandler(log: Logger): Promise<void> {
  const pubsub = getPubSub();

  // Atomic UPDATE+RETURNING joined with charging_stations so we can also tell
  // the station to release the connector. The status='active' guard makes
  // concurrent runs safe -- only one row is returned per expired reservation
  // even if the job somehow fans out.
  const expired = await client<ExpiredRow[]>`
    WITH updated AS (
      UPDATE reservations
      SET status = 'expired', updated_at = now()
      WHERE status = 'active' AND expires_at < now()
      RETURNING id, driver_id, reservation_id, station_id
    )
    SELECT
      updated.id,
      updated.driver_id,
      updated.reservation_id AS reservation_ocpp_id,
      charging_stations.station_id AS station_ocpp_id
    FROM updated
    INNER JOIN charging_stations ON charging_stations.id = updated.station_id
  `;

  for (const row of expired) {
    if (row.driver_id != null) {
      void dispatchDriverNotification(
        client,
        'reservation.Expired',
        row.driver_id,
        { reservationId: row.id },
        ALL_TEMPLATES_DIRS,
        pubsub,
      );
    }

    // Best-effort CancelReservation. CommandListener routes through
    // sendVersionAwareCommand for protocol translation. Offline stations get
    // the command queued via offline_command_queue and replayed on reconnect.
    try {
      await pubsub.publish(
        'ocpp_commands',
        JSON.stringify({
          commandId: crypto.randomUUID(),
          stationId: row.station_ocpp_id,
          action: 'CancelReservation',
          payload: { reservationId: row.reservation_ocpp_id },
        }),
      );
    } catch (err) {
      log.warn(
        { err, reservationId: row.id, stationOcppId: row.station_ocpp_id },
        'Failed to publish CancelReservation for expired reservation',
      );
    }
  }

  if (expired.length > 0) {
    log.info({ count: expired.length }, 'Expired reservations and dispatched cancellations');
  }

  // Warn drivers about reservations expiring within the warning window.
  const warningThreshold = new Date(Date.now() + EXPIRY_WARNING_MINUTES * 60 * 1000);
  const expiringSoon = await client<ExpiringRow[]>`
    SELECT id, driver_id, expires_at FROM reservations
    WHERE status = 'active'
      AND expires_at > now()
      AND expires_at <= ${warningThreshold}
  `;

  for (const row of expiringSoon) {
    if (row.driver_id != null) {
      void dispatchDriverNotification(
        client,
        'reservation.Expiring',
        row.driver_id,
        {
          reservationId: row.id,
          expiresAt: row.expires_at.toISOString(),
        },
        ALL_TEMPLATES_DIRS,
        pubsub,
      );
    }
  }
}
