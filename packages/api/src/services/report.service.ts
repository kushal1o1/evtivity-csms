// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { eq, sql } from 'drizzle-orm';
import { db, reports, getSystemTimezone } from '@evtivity/database';
import type { FastifyBaseLogger } from 'fastify';

/**
 * Compute the next-run-at timestamp for a report schedule, anchored at 6 AM in
 * the system timezone. Delegated to Postgres so date arithmetic (DST, end-of-
 * month clamp) is correct regardless of the API/worker host's timezone — JS
 * `Date#setHours` runs in the host's local tz, and `setMonth + setDate` walks
 * off the end of short months (Jan 31 + 1 month → Mar 3 in JS, vs Feb 28 in
 * Postgres).
 */
export async function computeNextRunAtInTz(
  frequency: string,
  dayOfWeek: number | null,
  dayOfMonth: number | null,
): Promise<Date> {
  const tz = await getSystemTimezone();
  const dow = dayOfWeek ?? 1;
  const dom = dayOfMonth ?? 1;
  const rows = await db.execute(sql`
    SELECT (
      CASE ${frequency}::text
        WHEN 'daily' THEN
          (date_trunc('day', (now() AT TIME ZONE ${tz}) + interval '1 day') + interval '6 hours')
            AT TIME ZONE ${tz}
        WHEN 'weekly' THEN (
          -- Postgres dow: 0=Sun..6=Sat, matching JS getDay()
          date_trunc('day', now() AT TIME ZONE ${tz})
            + interval '1 day' * (
                ((${dow}::int - extract(dow from now() AT TIME ZONE ${tz})::int + 7) % 7 + 6) % 7 + 1
              )
            + interval '6 hours'
        ) AT TIME ZONE ${tz}
        WHEN 'monthly' THEN (
          -- Last day of NEXT month (date_trunc('month', +2mo) - 1 day) gives
          -- the max-clamp for dom; then add (dom-1) days to land on the
          -- requested day of the next month.
          date_trunc('month', (now() AT TIME ZONE ${tz}) + interval '1 month')
            + interval '1 day' * (
                LEAST(
                  ${dom}::int,
                  extract(day from
                    date_trunc('month', (now() AT TIME ZONE ${tz}) + interval '2 month')
                      - interval '1 day'
                  )::int
                ) - 1
              )
            + interval '6 hours'
        ) AT TIME ZONE ${tz}
        ELSE
          (date_trunc('day', (now() AT TIME ZONE ${tz}) + interval '1 day') + interval '6 hours')
            AT TIME ZONE ${tz}
      END
    ) AS next_run_at
  `);
  // db.execute returns timestamptz columns as strings rather than Date
  // objects (unlike the type-aware db.select path). Drizzle's INSERT path
  // calls .toISOString() on the value, so we have to coerce to Date here.
  const row = (rows as unknown as Array<{ next_run_at: Date | string }>)[0];
  if (row == null) {
    throw new Error('Failed to compute next_run_at');
  }
  return row.next_run_at instanceof Date ? row.next_run_at : new Date(row.next_run_at);
}

export interface ReportGeneratorResult {
  data: Buffer;
  fileName: string;
}

export type ReportGenerator = (
  filters: Record<string, unknown>,
  format: string,
) => Promise<ReportGeneratorResult>;

const generatorRegistry = new Map<string, ReportGenerator>();

export function registerGenerator(reportType: string, generator: ReportGenerator): void {
  generatorRegistry.set(reportType, generator);
}

let _log: FastifyBaseLogger | null = null;

export function setReportLogger(log: FastifyBaseLogger): void {
  _log = log;
}

export async function queueReport(params: {
  name: string;
  reportType: string;
  format: string;
  filters: Record<string, unknown>;
  userId: string;
}): Promise<string> {
  const [row] = await db
    .insert(reports)
    .values({
      name: params.name,
      reportType: params.reportType,
      format: params.format,
      filters: params.filters,
      generatedById: params.userId,
    })
    .returning({ id: reports.id });

  const reportId = row?.id;
  if (reportId == null) return '';

  setImmediate(() => {
    void generateReport(reportId);
  });

  return reportId;
}

export async function generateReport(reportId: string): Promise<void> {
  await db.update(reports).set({ status: 'generating' }).where(eq(reports.id, reportId));

  const [report] = await db
    .select({
      reportType: reports.reportType,
      format: reports.format,
      filters: reports.filters,
    })
    .from(reports)
    .where(eq(reports.id, reportId));

  if (report == null) return;

  const generator = generatorRegistry.get(report.reportType);
  if (generator == null) {
    await db
      .update(reports)
      .set({
        status: 'failed',
        error: `No generator registered for report type: ${report.reportType}`,
        completedAt: sql`now()`,
      })
      .where(eq(reports.id, reportId));
    return;
  }

  try {
    const filters = report.filters != null ? (report.filters as Record<string, unknown>) : {};
    const result = await generator(filters, report.format);

    await db
      .update(reports)
      .set({
        status: 'completed',
        fileData: result.data,
        fileName: result.fileName,
        fileSize: result.data.length,
        completedAt: sql`now()`,
      })
      .where(eq(reports.id, reportId));
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    _log?.error({ reportId, error: err }, 'Report generation failed');
    await db
      .update(reports)
      .set({
        status: 'failed',
        error: errorMsg.slice(0, 1000),
        completedAt: sql`now()`,
      })
      .where(eq(reports.id, reportId));
  }
}
