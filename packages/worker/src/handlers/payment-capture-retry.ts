// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { sql } from 'drizzle-orm';
import { db } from '@evtivity/database';
import { decryptString, isSimulatedCustomer } from '@evtivity/lib';
import type { Logger } from 'pino';

interface PaymentCaptureShortfallRow extends Record<string, unknown> {
  pr_id: number;
  stripe_payment_intent_id: string | null;
  stripe_customer_id: string | null;
  captured_amount_cents: number | null;
  currency: string;
  final_cost_cents: number | null;
  site_id: string | null;
  session_id: string;
}

/**
 * Daily reconciliation pass for payment captures with a recoverable shortfall.
 *
 * Triggered when the original capture path took the top-up branch and the
 * second PaymentIntent (the delta beyond pre-auth) failed. Those records are
 * left with `status='captured'`, `captured_amount_cents = preAuthAmount`, and
 * a `failure_reason` mentioning the shortfall. We retry the top-up against
 * the same card. Successful retries clear `failure_reason` and bring
 * `captured_amount_cents` up to the session final cost.
 *
 * Idempotent via Stripe idempotency keys. Safe to run multiple times: cards
 * still failing leave the record unchanged for the next pass.
 */
export async function paymentCaptureRetryHandler(log: Logger): Promise<void> {
  // Only consider recent records (last 30 days) so we don't keep retrying
  // ancient declines forever. Failed cards typically don't recover after a
  // month.
  const rows = await db.execute<PaymentCaptureShortfallRow>(sql`
    SELECT pr.id AS pr_id,
           pr.stripe_payment_intent_id,
           pr.stripe_customer_id,
           pr.captured_amount_cents,
           pr.currency,
           cs.final_cost_cents,
           st.site_id,
           cs.id AS session_id
    FROM payment_records pr
    JOIN charging_sessions cs ON cs.id = pr.session_id
    JOIN charging_stations st ON st.id = cs.station_id
    WHERE pr.status = 'captured'
      AND pr.failure_reason IS NOT NULL
      AND pr.failure_reason LIKE 'Top-up declined:%'
      AND pr.captured_amount_cents IS NOT NULL
      AND cs.final_cost_cents IS NOT NULL
      AND cs.final_cost_cents > pr.captured_amount_cents
      AND pr.created_at > now() - interval '30 days'
    ORDER BY pr.created_at ASC
    LIMIT 100
  `);

  if (rows.length === 0) {
    log.debug('No payment records with capture shortfall to retry');
    return;
  }

  log.info({ count: rows.length }, 'Retrying capture top-up for payment records with shortfall');

  // Reuse the same Stripe wiring the projection uses. We bypass the API's
  // getStripeConfig to avoid pulling the API package into the worker; instead
  // we read the keys directly from settings.
  const settingsRows = await db.execute<{ key: string; value: string | null }>(sql`
    SELECT key, value FROM settings
    WHERE key IN ('stripe.secretKeyEnc', 'stripe.platformFeePercent')
  `);
  const settingsMap = new Map(settingsRows.map((r) => [r.key, r.value]));
  const secretKeyEnc = settingsMap.get('stripe.secretKeyEnc');
  if (secretKeyEnc == null || secretKeyEnc === '') {
    log.warn('Stripe is not configured; cannot retry capture');
    return;
  }
  const encryptionKey = process.env['SETTINGS_ENCRYPTION_KEY'];
  if (encryptionKey == null || encryptionKey === '') {
    log.warn('SETTINGS_ENCRYPTION_KEY missing; cannot retry capture');
    return;
  }
  const secretKey = decryptString(secretKeyEnc, encryptionKey);
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(secretKey);

  let recovered = 0;
  let stillFailed = 0;

  for (const row of rows) {
    const shortfall = (row.final_cost_cents ?? 0) - (row.captured_amount_cents ?? 0);
    if (shortfall <= 0) continue;
    if (row.stripe_payment_intent_id == null) continue;
    if (row.stripe_customer_id != null && isSimulatedCustomer(row.stripe_customer_id)) continue;

    try {
      const orig = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id);
      const customerId =
        typeof orig.customer === 'string' ? orig.customer : (orig.customer?.id ?? null);
      const pmId =
        typeof orig.payment_method === 'string'
          ? orig.payment_method
          : (orig.payment_method?.id ?? null);
      if (customerId == null || pmId == null) {
        log.warn(
          { paymentRecordId: row.pr_id },
          'Original PaymentIntent missing customer or payment_method; skipping',
        );
        continue;
      }

      const params: Record<string, unknown> = {
        amount: shortfall,
        currency: row.currency.toLowerCase(),
        customer: customerId,
        payment_method: pmId,
        confirm: true,
        off_session: true,
        capture_method: 'automatic',
        description: `Capture retry for session ${row.session_id}`,
      };
      if (orig.on_behalf_of != null) {
        params['on_behalf_of'] = orig.on_behalf_of;
        params['transfer_data'] = {
          destination:
            typeof orig.on_behalf_of === 'string' ? orig.on_behalf_of : orig.on_behalf_of.id,
        };
      }

      const topUp = await stripe.paymentIntents.create(
        params as unknown as Parameters<typeof stripe.paymentIntents.create>[0],
        {
          idempotencyKey: `topup_retry_${String(row.pr_id)}_${String(row.captured_amount_cents)}`,
        },
      );

      await db.execute(sql`
        UPDATE payment_records
        SET captured_amount_cents = ${row.final_cost_cents},
            failure_reason = NULL,
            last_action_reason = ${`Cron retry top-up; recovered ${String(shortfall)}c via ${topUp.id}`},
            updated_at = now()
        WHERE id = ${row.pr_id}
      `);
      recovered++;
      log.info(
        { paymentRecordId: row.pr_id, shortfall, topUpIntentId: topUp.id },
        'Recovered capture shortfall via cron retry',
      );
    } catch (err: unknown) {
      stillFailed++;
      const message = err instanceof Error ? err.message.slice(0, 350) : 'Unknown error';
      log.warn(
        { paymentRecordId: row.pr_id, shortfall, err },
        'Capture retry failed; will try again next run',
      );
      await db
        .execute(
          sql`
          UPDATE payment_records
          SET failure_reason = ${`Top-up declined: ${message}; shortfall ${String(shortfall)}c (last retry ${new Date().toISOString()})`},
              updated_at = now()
          WHERE id = ${row.pr_id}
        `,
        )
        .catch(() => {
          // Non-critical: failure_reason update is best-effort
        });
    }
  }

  log.info({ recovered, stillFailed, total: rows.length }, 'Capture retry pass complete');
}
