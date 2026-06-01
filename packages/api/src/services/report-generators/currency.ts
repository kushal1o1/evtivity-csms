// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

// Symbol lookup keeps the report output readable in the dominant locales the
// CSMS supports. Unknown ISO 4217 codes fall back to "<CODE> <amount>" so the
// value is never silently mislabelled.
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  CAD: '$',
  AUD: '$',
  MXN: '$',
  EUR: '€',
  GBP: '£',
  CHF: 'CHF ',
  SEK: 'kr ',
  NOK: 'kr ',
  DKK: 'kr ',
};

export function formatCents(cents: number, currency: string): string {
  const code = currency.toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code] ?? `${code} `;
  return `${symbol}${(cents / 100).toFixed(2)}`;
}
