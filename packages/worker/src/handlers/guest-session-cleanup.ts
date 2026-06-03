// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { eq, and, lte, sql } from 'drizzle-orm';
import { db, guestSessions } from '@evtivity/database';
import type { Logger } from 'pino';
import { getStripeConfig, cancelPaymentIntent } from '@evtivity/api/src/services/stripe.service.js';

export async function guestSessionCleanupHandler(log: Logger): Promise<void> {
  const expired = await db
    .select()
    .from(guestSessions)
    .where(
      and(
        sql`${guestSessions.status} IN ('pending_payment', 'payment_authorized')`,
        lte(guestSessions.expiresAt, new Date()),
      ),
    );

  for (const gs of expired) {
    // Cancel Stripe pre-auth and mark the row expired in independent try/catch
    // blocks. A combined try/catch would leave the row stuck if Stripe
    // succeeded once but the DB write failed -- the next run would re-call
    // cancel on an already-cancelled PI (Stripe throws), the catch would skip
    // the DB write again, and the row would remain in pending_payment forever.
    if (gs.stripePaymentIntentId != null) {
      try {
        const config = await getStripeConfig(null);
        if (config != null) {
          await cancelPaymentIntent(config, gs.stripePaymentIntentId);
        }
      } catch (cancelErr: unknown) {
        log.warn(
          { guestSessionId: gs.id, err: cancelErr },
          'Failed to cancel Stripe pre-auth on guest session expiry; hold will release naturally in 7 days',
        );
      }
    }
    try {
      await db
        .update(guestSessions)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(guestSessions.id, gs.id));
    } catch (dbErr: unknown) {
      log.error({ guestSessionId: gs.id, error: dbErr }, 'Failed to mark guest session expired');
    }
  }

  if (expired.length > 0) {
    log.info({ count: expired.length }, 'Expired guest sessions cleaned up');
  }
}
