// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { sql, and, eq, count } from 'drizzle-orm';
import {
  db,
  chargingSessions,
  sites,
  chargingStations,
  paymentRecords,
  getSystemTimezone,
} from '@evtivity/database';
import { buildCsv } from './csv-builder.js';
import { buildXlsx } from './xlsx-builder.js';
import { PdfReportBuilder } from './pdf-builder.js';
import { formatCents } from './currency.js';
import type { ReportGeneratorResult } from '../report.service.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface Filters {
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  siteId?: string | undefined;
}

function parseFilters(raw: Record<string, unknown>): Filters {
  const dateFromRaw = typeof raw['dateFrom'] === 'string' ? raw['dateFrom'] : undefined;
  const dateToRaw = typeof raw['dateTo'] === 'string' ? raw['dateTo'] : undefined;
  return {
    dateFrom: dateFromRaw != null && ISO_DATE.test(dateFromRaw) ? dateFromRaw : undefined,
    dateTo: dateToRaw != null && ISO_DATE.test(dateToRaw) ? dateToRaw : undefined,
    siteId: typeof raw['siteId'] === 'string' ? raw['siteId'] : undefined,
  };
}

function buildDateConditions(filters: Filters, tz: string) {
  const conditions = [];
  // Compare startedAt projected into the system timezone so YYYY-MM-DD
  // filters mean "the operator's local day" instead of UTC midnight.
  if (filters.dateFrom != null) {
    conditions.push(
      sql`(${chargingSessions.startedAt} AT TIME ZONE ${tz})::date >= ${filters.dateFrom}::date`,
    );
  }
  if (filters.dateTo != null) {
    conditions.push(
      sql`(${chargingSessions.startedAt} AT TIME ZONE ${tz})::date <= ${filters.dateTo}::date`,
    );
  }
  return conditions;
}

interface RevenueByDay {
  date: string;
  currency: string;
  revenueCents: number;
  sessionCount: number;
}

interface RevenueBySite {
  siteName: string;
  currency: string;
  revenueCents: number;
  sessionCount: number;
  energyKwh: number;
}

interface PaymentBreakdown {
  status: string;
  currency: string;
  count: number;
  totalCents: number;
}

async function queryRevenueByDay(filters: Filters, tz: string): Promise<RevenueByDay[]> {
  const conditions = [
    ...buildDateConditions(filters, tz),
    sql`coalesce(${chargingSessions.finalCostCents}, ${chargingSessions.currentCostCents}) is not null`,
  ];

  // GROUP BY date + currency so multi-currency days produce separate rows
  // (summing different currencies into one number would be meaningless).
  const baseQuery = db
    .select({
      date: sql<string>`date_trunc('day', ${chargingSessions.startedAt} AT TIME ZONE ${tz})::date::text`,
      currency: sql<string>`coalesce(${chargingSessions.currency}, 'USD')`,
      revenueCents: sql<number>`coalesce(sum(coalesce(${chargingSessions.finalCostCents}, ${chargingSessions.currentCostCents})), 0)::float8`,
      sessionCount: count(),
    })
    .from(chargingSessions);

  if (filters.siteId != null) {
    conditions.push(eq(chargingStations.siteId, filters.siteId));
    return baseQuery
      .innerJoin(chargingStations, eq(chargingSessions.stationId, chargingStations.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(sql`1, 2`)
      .orderBy(sql`1, 2`);
  }

  return baseQuery
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(sql`1, 2`)
    .orderBy(sql`1, 2`);
}

async function queryRevenueBySite(filters: Filters, tz: string): Promise<RevenueBySite[]> {
  const conditions = [
    ...buildDateConditions(filters, tz),
    sql`coalesce(${chargingSessions.finalCostCents}, ${chargingSessions.currentCostCents}) is not null`,
  ];

  if (filters.siteId != null) {
    conditions.push(eq(sites.id, filters.siteId));
  }

  // Multi-currency sites surface one row per (site, currency) pair, same as
  // the per-day breakdown. A site that switched currency mid-period is rare
  // but should still total correctly.
  const rows = await db
    .select({
      siteName: sql<string>`coalesce(${sites.name}, 'No Site')`,
      currency: sql<string>`coalesce(${chargingSessions.currency}, 'USD')`,
      revenueCents: sql<number>`coalesce(sum(coalesce(${chargingSessions.finalCostCents}, ${chargingSessions.currentCostCents})), 0)::float8`,
      sessionCount: count(),
      energyKwh: sql<number>`coalesce(sum(${chargingSessions.energyDeliveredWh}::numeric / 1000), 0)::float8`,
    })
    .from(chargingSessions)
    .leftJoin(chargingStations, eq(chargingSessions.stationId, chargingStations.id))
    .leftJoin(sites, eq(chargingStations.siteId, sites.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(sites.id, sites.name, chargingSessions.currency)
    // Order by revenue (position 3 in the SELECT list) desc so the biggest
    // sites surface first; positional reference avoids re-stating the
    // SUM aggregate.
    .orderBy(sql`3 desc`);

  return rows;
}

async function queryPaymentBreakdown(filters: Filters, tz: string): Promise<PaymentBreakdown[]> {
  // Payment breakdown must honour the same date + site filters as the rest
  // of the report. Without joining to chargingSessions, the prior version
  // returned cross-time/cross-site totals even when the report was scoped.
  const conditions = buildDateConditions(filters, tz);
  if (filters.siteId != null) {
    conditions.push(eq(chargingStations.siteId, filters.siteId));
  }

  // GROUP BY currency for the same multi-currency reason as the other
  // queries; capturedAmountCents in EUR can't be summed with USD.
  return db
    .select({
      status: paymentRecords.status,
      currency: paymentRecords.currency,
      count: count(),
      totalCents: sql<number>`coalesce(sum(${paymentRecords.capturedAmountCents}), 0)::float8`,
    })
    .from(paymentRecords)
    .innerJoin(chargingSessions, eq(paymentRecords.sessionId, chargingSessions.id))
    .innerJoin(chargingStations, eq(chargingSessions.stationId, chargingStations.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(paymentRecords.status, paymentRecords.currency);
}

export async function generateRevenueReport(
  rawFilters: Record<string, unknown>,
  format: string,
): Promise<ReportGeneratorResult> {
  const filters = parseFilters(rawFilters);
  const tz = await getSystemTimezone();

  const [byDay, bySite, payments] = await Promise.all([
    queryRevenueByDay(filters, tz),
    queryRevenueBySite(filters, tz),
    queryPaymentBreakdown(filters, tz),
  ]);

  const totalSessions = bySite.reduce((sum, r) => sum + r.sessionCount, 0);
  // Totals grouped by currency so the PDF summary row can list each one
  // (we deliberately do not flatten cross-currency totals into a single
  // number; that misrepresents revenue in mixed-currency networks).
  const totalsByCurrency = new Map<string, number>();
  for (const r of bySite) {
    totalsByCurrency.set(r.currency, (totalsByCurrency.get(r.currency) ?? 0) + r.revenueCents);
  }

  const dateLabel = [filters.dateFrom, filters.dateTo].filter(Boolean).join(' to ') || 'All time';

  if (format === 'csv') {
    const headers = ['Date', 'Currency', 'Revenue', 'Sessions'];
    const rows: unknown[][] = byDay.map((r) => [
      r.date,
      r.currency,
      formatCents(r.revenueCents, r.currency),
      r.sessionCount,
    ]);
    rows.push([]);
    rows.push(['Site', 'Currency', 'Revenue', 'Sessions', 'Energy (kWh)']);
    for (const r of bySite) {
      rows.push([
        r.siteName,
        r.currency,
        formatCents(r.revenueCents, r.currency),
        r.sessionCount,
        r.energyKwh.toFixed(1),
      ]);
    }
    rows.push([]);
    rows.push(['Payment Status', 'Currency', 'Count', 'Total']);
    for (const r of payments) {
      rows.push([r.status, r.currency, r.count, formatCents(r.totalCents, r.currency)]);
    }

    const csv = buildCsv(headers, rows);
    return {
      data: Buffer.from(csv, 'utf-8'),
      fileName: `revenue-report-${String(Date.now())}.csv`,
    };
  } else if (format === 'xlsx') {
    const data = await buildXlsx([
      {
        name: 'By Day',
        headers: ['Date', 'Currency', 'Revenue', 'Sessions'],
        rows: byDay.map((r) => [
          r.date,
          r.currency,
          formatCents(r.revenueCents, r.currency),
          r.sessionCount,
        ]),
      },
      {
        name: 'By Site',
        headers: ['Site', 'Currency', 'Revenue', 'Sessions', 'Energy (kWh)'],
        rows: bySite.map((r) => [
          r.siteName,
          r.currency,
          formatCents(r.revenueCents, r.currency),
          r.sessionCount,
          r.energyKwh.toFixed(1),
        ]),
      },
      {
        name: 'Payments',
        headers: ['Payment Status', 'Currency', 'Count', 'Total'],
        rows: payments.map((r) => [
          r.status,
          r.currency,
          r.count,
          formatCents(r.totalCents, r.currency),
        ]),
      },
    ]);
    return { data, fileName: `revenue-report-${String(Date.now())}.xlsx` };
  }

  // PDF
  const pdf = new PdfReportBuilder();
  pdf.addTitle('Revenue Report');
  pdf.addSubtitle(`Period: ${dateLabel}`);
  for (const [currency, cents] of totalsByCurrency) {
    pdf.addSummaryRow(`Total Revenue (${currency}):`, formatCents(cents, currency));
  }
  pdf.addSummaryRow('Total Sessions:', String(totalSessions));

  pdf.addTable(
    ['Date', 'Currency', 'Revenue', 'Sessions'],
    byDay.map((r) => [r.date, r.currency, formatCents(r.revenueCents, r.currency), r.sessionCount]),
  );

  pdf.addTable(
    ['Site', 'Currency', 'Revenue', 'Sessions', 'Energy (kWh)'],
    bySite.map((r) => [
      r.siteName,
      r.currency,
      formatCents(r.revenueCents, r.currency),
      r.sessionCount,
      r.energyKwh.toFixed(1),
    ]),
  );

  pdf.addTable(
    ['Payment Status', 'Currency', 'Count', 'Total'],
    payments.map((r) => [r.status, r.currency, r.count, formatCents(r.totalCents, r.currency)]),
  );

  const data = await pdf.build();
  return { data, fileName: `revenue-report-${String(Date.now())}.pdf` };
}
