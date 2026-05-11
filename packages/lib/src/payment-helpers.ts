// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

/**
 * Detects test/simulated Stripe customer IDs that should bypass real Stripe
 * API calls. The seed creates simulated customers with a `cus_sim_` prefix to
 * exercise the payment flow without touching the live Stripe account. Real
 * Stripe customer IDs are `cus_` + random alphanumeric characters and never
 * start with `cus_sim_`.
 */
export function isSimulatedCustomer(stripeCustomerId: string): boolean {
  return stripeCustomerId.startsWith('cus_sim_');
}

/**
 * Probabilistic failure simulator for the simulated payment path. Triggered
 * when the simulated customer code path needs to exercise the
 * pre-auth-failed / capture-failed branches without touching real Stripe.
 * Returns true for ~20% of calls.
 */
export function shouldSimulatePaymentFailure(): boolean {
  return Math.random() < 0.2;
}

/**
 * Structural tariff shape sufficient to determine if a session is free.
 * Accepts the price fields as nullable strings so it can be called with
 * either Drizzle row types or postgres-js raw query results without
 * coupling the lib package to either driver.
 */
interface FreeTariffShape {
  pricePerKwh: string | null;
  pricePerMinute: string | null;
  pricePerSession: string | null;
  idleFeePricePerMinute: string | null;
}

/**
 * Returns true when every price component on the tariff is null or zero.
 * Treats `null` (no tariff resolved) as free so guest and authenticated flows
 * behave identically when pricing isn't configured.
 */
export function isTariffFree(tariff: FreeTariffShape | null): boolean {
  if (tariff == null) return true;
  return (
    (tariff.pricePerKwh == null || Number(tariff.pricePerKwh) === 0) &&
    (tariff.pricePerMinute == null || Number(tariff.pricePerMinute) === 0) &&
    (tariff.pricePerSession == null || Number(tariff.pricePerSession) === 0) &&
    (tariff.idleFeePricePerMinute == null || Number(tariff.idleFeePricePerMinute) === 0)
  );
}
