// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { sql, and, eq, count, inArray } from 'drizzle-orm';
import {
  db,
  chargingSessions,
  chargingStations,
  sites,
  settings,
  getSystemTimezone,
} from '@evtivity/database';
import { buildCsv } from './csv-builder.js';
import { buildXlsx } from './xlsx-builder.js';
import { PdfReportBuilder } from './pdf-builder.js';
import type { ReportGeneratorResult } from '../report.service.js';

// EPA defaults
const DEFAULT_GRID_EMISSION_FACTOR = 0.386; // kg CO2/kWh (US average)
const DEFAULT_EV_EFFICIENCY = 3.3; // miles/kWh
const DEFAULT_GASOLINE_EMISSION_FACTOR = 8.887; // kg CO2/gallon
const DEFAULT_AVG_MPG = 25.4; // US average fuel economy

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

interface SustainabilitySettings {
  gridEmissionFactor: number;
  evEfficiency: number;
  gasolineEmissionFactor: number;
  avgMpg: number;
}

async function getSustainabilitySettings(): Promise<SustainabilitySettings> {
  const keys = [
    'sustainability.gridEmissionFactor',
    'sustainability.evEfficiency',
    'sustainability.gasolineEmissionFactor',
    'sustainability.avgMpg',
  ];

  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, keys));

  const map = new Map(rows.map((r) => [r.key, r.value]));

  return {
    gridEmissionFactor:
      Number(map.get('sustainability.gridEmissionFactor')) || DEFAULT_GRID_EMISSION_FACTOR,
    evEfficiency: Number(map.get('sustainability.evEfficiency')) || DEFAULT_EV_EFFICIENCY,
    gasolineEmissionFactor:
      Number(map.get('sustainability.gasolineEmissionFactor')) || DEFAULT_GASOLINE_EMISSION_FACTOR,
    avgMpg: Number(map.get('sustainability.avgMpg')) || DEFAULT_AVG_MPG,
  };
}

interface EnergyBySite {
  siteName: string;
  energyKwh: number;
  sessionCount: number;
}

interface EnergyByDay {
  date: string;
  energyKwh: number;
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

async function queryEnergyBySite(filters: Filters, tz: string): Promise<EnergyBySite[]> {
  const conditions = buildDateConditions(filters, tz);
  if (filters.siteId != null) {
    conditions.push(eq(chargingStations.siteId, filters.siteId));
  }

  const rows = await db
    .select({
      siteName: sql<string>`coalesce(${sites.name}, 'No Site')`,
      energyKwh: sql<number>`coalesce(sum(${chargingSessions.energyDeliveredWh}::numeric / 1000), 0)::float8`,
      sessionCount: count(),
    })
    .from(chargingSessions)
    .leftJoin(chargingStations, eq(chargingSessions.stationId, chargingStations.id))
    .leftJoin(sites, eq(chargingStations.siteId, sites.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(sites.id, sites.name)
    .orderBy(sql`2 desc`);

  return rows;
}

async function queryEnergyByDay(filters: Filters, tz: string): Promise<EnergyByDay[]> {
  const conditions = buildDateConditions(filters, tz);
  // Honour the same siteId filter the per-site section uses, otherwise the
  // daily breakdown shows cross-site totals while the per-site table only
  // shows one site.
  if (filters.siteId != null) {
    const rows = await db
      .select({
        date: sql<string>`date_trunc('day', ${chargingSessions.startedAt} AT TIME ZONE ${tz})::date::text`,
        energyKwh: sql<number>`coalesce(sum(${chargingSessions.energyDeliveredWh}::numeric / 1000), 0)::float8`,
      })
      .from(chargingSessions)
      .innerJoin(chargingStations, eq(chargingSessions.stationId, chargingStations.id))
      .where(and(...conditions, eq(chargingStations.siteId, filters.siteId)))
      .groupBy(sql`1`)
      .orderBy(sql`1`);
    return rows;
  }

  const rows = await db
    .select({
      date: sql<string>`date_trunc('day', ${chargingSessions.startedAt} AT TIME ZONE ${tz})::date::text`,
      energyKwh: sql<number>`coalesce(sum(${chargingSessions.energyDeliveredWh}::numeric / 1000), 0)::float8`,
    })
    .from(chargingSessions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  return rows;
}

function siteRow(r: EnergyBySite, cfg: SustainabilitySettings): unknown[] {
  const s = computeSustainability(r.energyKwh, cfg);
  return [r.siteName, r.energyKwh.toFixed(2), r.sessionCount, s.netGhgReductionKg.toFixed(2)];
}

function dayRow(r: EnergyByDay, cfg: SustainabilitySettings): unknown[] {
  const s = computeSustainability(r.energyKwh, cfg);
  return [r.date, r.energyKwh.toFixed(2), s.netGhgReductionKg.toFixed(2)];
}

function computeSustainability(energyKwh: number, cfg: SustainabilitySettings) {
  // GHG prevented = energy delivered * grid emission factor
  const ghgPreventedKg = energyKwh * cfg.gridEmissionFactor;

  // Miles driven on electricity
  const evMiles = energyKwh * cfg.evEfficiency;

  // Gallons of gasoline displaced
  const gallonsDisplaced = evMiles / cfg.avgMpg;

  // CO2 from displaced gasoline
  const gasolineCo2Kg = gallonsDisplaced * cfg.gasolineEmissionFactor;

  // Net GHG reduction (gasoline CO2 - grid CO2)
  const netGhgReductionKg = gasolineCo2Kg - ghgPreventedKg;

  return {
    ghgPreventedKg: Math.round(ghgPreventedKg * 100) / 100,
    evMiles: Math.round(evMiles * 100) / 100,
    gallonsDisplaced: Math.round(gallonsDisplaced * 100) / 100,
    gasolineCo2Kg: Math.round(gasolineCo2Kg * 100) / 100,
    netGhgReductionKg: Math.round(netGhgReductionKg * 100) / 100,
  };
}

export async function generateSustainabilityReport(
  rawFilters: Record<string, unknown>,
  format: string,
): Promise<ReportGeneratorResult> {
  const filters = parseFilters(rawFilters);
  const [cfg, tz] = await Promise.all([getSustainabilitySettings(), getSystemTimezone()]);

  const [bySite, byDay] = await Promise.all([
    queryEnergyBySite(filters, tz),
    queryEnergyByDay(filters, tz),
  ]);

  const totalKwh = bySite.reduce((sum, r) => sum + r.energyKwh, 0);
  const totals = computeSustainability(totalKwh, cfg);
  const dateLabel = [filters.dateFrom, filters.dateTo].filter(Boolean).join(' to ') || 'All time';

  if (format === 'csv') {
    const headers = ['Metric', 'Value'];
    const rows: unknown[][] = [
      ['Total Energy Delivered (kWh)', totalKwh.toFixed(2)],
      ['Net GHG Reduction (kg CO₂)', totals.netGhgReductionKg.toFixed(2)],
      ['Grid CO₂ Emissions (kg)', totals.ghgPreventedKg.toFixed(2)],
      ['Gasoline CO₂ Avoided (kg)', totals.gasolineCo2Kg.toFixed(2)],
      ['EV Miles Enabled', totals.evMiles.toFixed(2)],
      ['Gasoline Gallons Displaced', totals.gallonsDisplaced.toFixed(2)],
      [],
      ['Configuration'],
      ['Grid Emission Factor (kg CO₂/kWh)', cfg.gridEmissionFactor],
      ['EV Efficiency (miles/kWh)', cfg.evEfficiency],
      ['Gasoline Emission Factor (kg CO₂/gal)', cfg.gasolineEmissionFactor],
      ['Average Vehicle MPG', cfg.avgMpg],
      [],
      ['By Site'],
      ['Site', 'Energy (kWh)', 'Sessions', 'Net GHG Reduction (kg CO₂)'],
    ];
    for (const r of bySite) {
      rows.push(siteRow(r, cfg));
    }
    rows.push([]);
    rows.push(['Daily Energy']);
    rows.push(['Date', 'Energy (kWh)', 'Net GHG Reduction (kg CO₂)']);
    for (const r of byDay) {
      rows.push(dayRow(r, cfg));
    }

    const csv = buildCsv(headers, rows);
    return {
      data: Buffer.from(csv, 'utf-8'),
      fileName: `sustainability-report-${String(Date.now())}.csv`,
    };
  } else if (format === 'xlsx') {
    const data = await buildXlsx([
      {
        name: 'Summary',
        headers: ['Metric', 'Value'],
        rows: [
          ['Total Energy Delivered (kWh)', totalKwh.toFixed(2)],
          ['Net GHG Reduction (kg CO₂)', totals.netGhgReductionKg.toFixed(2)],
          ['Grid CO₂ Emissions (kg)', totals.ghgPreventedKg.toFixed(2)],
          ['Gasoline CO₂ Avoided (kg)', totals.gasolineCo2Kg.toFixed(2)],
          ['EV Miles Enabled', totals.evMiles.toFixed(2)],
          ['Gasoline Gallons Displaced', totals.gallonsDisplaced.toFixed(2)],
        ],
      },
      {
        name: 'Configuration',
        headers: ['Parameter', 'Value'],
        rows: [
          ['Grid Emission Factor (kg CO₂/kWh)', cfg.gridEmissionFactor],
          ['EV Efficiency (miles/kWh)', cfg.evEfficiency],
          ['Gasoline Emission Factor (kg CO₂/gal)', cfg.gasolineEmissionFactor],
          ['Average Vehicle MPG', cfg.avgMpg],
        ],
      },
      {
        name: 'By Site',
        headers: ['Site', 'Energy (kWh)', 'Sessions', 'Net GHG Reduction (kg CO₂)'],
        rows: bySite.map((r) => siteRow(r, cfg)),
      },
      {
        name: 'Daily Energy',
        headers: ['Date', 'Energy (kWh)', 'Net GHG Reduction (kg CO₂)'],
        rows: byDay.map((r) => dayRow(r, cfg)),
      },
    ]);
    return { data, fileName: `sustainability-report-${String(Date.now())}.xlsx` };
  }

  const pdf = new PdfReportBuilder();
  pdf.addTitle('Sustainability Report');
  pdf.addSubtitle(`Period: ${dateLabel}`);
  pdf.addSummaryRow('Total Energy Delivered:', `${totalKwh.toFixed(2)} kWh`);
  pdf.addSummaryRow('Net GHG Reduction:', `${totals.netGhgReductionKg.toFixed(2)} kg CO₂`);
  pdf.addSummaryRow('EV Miles Enabled:', totals.evMiles.toFixed(0));
  pdf.addSummaryRow('Gasoline Displaced:', `${totals.gallonsDisplaced.toFixed(2)} gallons`);

  pdf.addTable(
    ['Site', 'Energy (kWh)', 'Sessions', 'GHG Reduction (kg CO₂)'],
    bySite.map((r) => siteRow(r, cfg)),
  );

  pdf.addTable(
    ['Date', 'Energy (kWh)', 'GHG Reduction (kg CO₂)'],
    byDay.map((r) => dayRow(r, cfg)),
  );

  const data = await pdf.build();
  return { data, fileName: `sustainability-report-${String(Date.now())}.pdf` };
}
