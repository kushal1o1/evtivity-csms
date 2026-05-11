// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { Worker, type Queue, type ConnectionOptions } from 'bullmq';
import { eq, and } from 'drizzle-orm';
import type { PubSubClient } from '@evtivity/lib';
import { createLogger } from '@evtivity/lib';
import { db, guestSessions, paymentRecords } from '@evtivity/database';
import { QUEUE_NAMES } from './queues.js';
import { logJobStarted, logJobCompleted, logJobFailed } from './job-logger.js';
import { handleGuestSessionEvent } from '@evtivity/api/src/services/guest-session.service.js';

const log = createLogger('guest-session-worker');

interface CsmsEvent {
  type: string;
  sessionId?: string;
  idToken?: { idToken: string; type: string };
  [key: string]: unknown;
}

/**
 * Subscribes to csms_events pub/sub and enqueues guest session jobs.
 * Using jobId deduplication means if multiple worker replicas receive
 * the same pub/sub event, only one BullMQ job is created per session.
 */
export async function startGuestSessionBridge(
  pubsub: PubSubClient,
  guestSessionQueue: Queue,
): Promise<() => Promise<void>> {
  const subscription = await pubsub.subscribe('csms_events', (payload: string) => {
    let event: CsmsEvent;
    try {
      event = JSON.parse(payload) as CsmsEvent;
    } catch {
      return;
    }

    if (event.type === 'TransactionStarted' && event.idToken?.idToken != null) {
      void guestSessionQueue
        .add(
          'guest-session-started',
          { event },
          { jobId: `guest-session-started-${event.idToken.idToken}`, attempts: 3 },
        )
        .catch((err: unknown) => {
          log.error({ err }, 'Failed to enqueue guest-session-started job');
        });
    }

    if (event.type === 'TransactionEnded' && event.sessionId != null) {
      void guestSessionQueue
        .add(
          'guest-session-ended',
          { sessionId: event.sessionId },
          { jobId: `guest-session-ended-${event.sessionId}`, attempts: 3 },
        )
        .catch((err: unknown) => {
          log.error({ err }, 'Failed to enqueue guest-session-ended job');
        });
    }
  });

  log.info('Guest session bridge started');

  return async () => {
    await subscription.unsubscribe();
    log.info('Guest session bridge stopped');
  };
}

/**
 * Creates the BullMQ Worker that processes guest session jobs.
 */
export function createGuestSessionWorker(connection: ConnectionOptions): Worker {
  const worker = new Worker(
    QUEUE_NAMES.GUEST_SESSION_EVENTS,
    async (job) => {
      const logId = await logJobStarted(job.name, 'guest-session-events');
      const startTime = Date.now();
      try {
        const data = job.data as Record<string, unknown>;
        if (job.name === 'guest-session-started') {
          await handleGuestSessionEvent(data.event as CsmsEvent, log);
        } else if (job.name === 'guest-session-ended') {
          await handleGuestSessionEvent(
            { type: 'TransactionEnded', sessionId: data.sessionId as string },
            log,
          );
        }
        await logJobCompleted(logId, Date.now() - startTime);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        await logJobFailed(logId, Date.now() - startTime, errorMsg).catch(() => {});
        throw err;
      }
    },
    { connection, concurrency: 10 },
  );

  worker.on('failed', (job, err) => {
    if (job == null) return;
    log.error(
      { jobName: job.name, attemptsMade: job.attemptsMade, error: err },
      'Guest session job failed',
    );

    // After the final retry, flip the guest session to `failed`, mark the
    // payment record `failed` with a clear reason, and cancel the Stripe
    // pre-auth so the cardholder's hold releases immediately rather than
    // waiting for Stripe's 7-day natural expiry. Without this, the portal
    // would show "completed" while Stripe still has the hold and the
    // payment_records row stays `pre_authorized` until the daily
    // reconciliation cron eventually catches it.
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return;
    if (job.name !== 'guest-session-ended') return;

    const data = job.data as Record<string, unknown>;
    const sessionId = data.sessionId as string | undefined;
    if (sessionId == null) return;

    const failureReason = err instanceof Error ? err.message.slice(0, 500) : 'Unknown error';

    void (async () => {
      try {
        await db
          .update(guestSessions)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(guestSessions.chargingSessionId, sessionId));

        const [pr] = await db
          .select({
            id: paymentRecords.id,
            stripePaymentIntentId: paymentRecords.stripePaymentIntentId,
            sitePaymentConfigId: paymentRecords.sitePaymentConfigId,
            status: paymentRecords.status,
          })
          .from(paymentRecords)
          .where(
            and(
              eq(paymentRecords.sessionId, sessionId),
              eq(paymentRecords.status, 'pre_authorized'),
            ),
          )
          .limit(1);

        if (pr == null) return;

        await db
          .update(paymentRecords)
          .set({
            status: 'failed',
            failureReason: `Capture worker exhausted retries: ${failureReason}`,
            updatedAt: new Date(),
          })
          .where(eq(paymentRecords.id, pr.id));

        if (pr.stripePaymentIntentId != null) {
          try {
            // Lazy-load to avoid pulling the API service's env-validating
            // config module into the worker's module graph at import time
            // (it crashes if API_PORT etc. aren't set, e.g. in unit tests).
            const stripeService = await import('@evtivity/api/src/services/stripe.service.js');
            const config = await stripeService.getStripeConfig(null);
            if (config != null) {
              await stripeService.cancelPaymentIntent(config, pr.stripePaymentIntentId);
            }
          } catch (cancelErr: unknown) {
            log.warn(
              { sessionId, paymentRecordId: pr.id, err: cancelErr },
              'Failed to cancel Stripe pre-auth after exhausted retries; hold will expire naturally in 7 days',
            );
          }
        }
      } catch (cleanupErr: unknown) {
        log.error(
          { sessionId, err: cleanupErr },
          'Failed to clean up after exhausted guest capture retries',
        );
      }
    })();
  });

  return worker;
}
