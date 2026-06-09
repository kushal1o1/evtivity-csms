// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';

import {
  resolveElectricityRate,
  calculateElectricityCostCents,
  deriveElectricityRatePriority,
  type ElectricityRatePeriod,
  type ElectricityRatePeriodRestrictions,
} from '../electricity-rate.js';

function period(
  overrides: Partial<ElectricityRatePeriod> & {
    restrictions: ElectricityRatePeriodRestrictions | null;
  },
): ElectricityRatePeriod {
  return {
    id: 1,
    siteId: 'sit_test',
    name: 'rate',
    ratePerKwh: '0.10',
    priority: deriveElectricityRatePriority(overrides.restrictions),
    isDefault: overrides.restrictions == null,
    ...overrides,
  };
}

const TZ = 'UTC';
// 2026-06-08 is a Monday.
const mondayNoon = new Date('2026-06-08T12:00:00Z');
const mondayEvening = new Date('2026-06-08T20:00:00Z');
const mondayLateNight = new Date('2026-06-08T23:00:00Z');

describe('resolveElectricityRate', () => {
  it('returns null when there are no periods', () => {
    expect(resolveElectricityRate([], mondayNoon, TZ)).toBeNull();
  });

  it('falls back to the default flat-rate period', () => {
    const def = period({ id: 1, name: 'flat', ratePerKwh: '0.11', restrictions: null });
    expect(resolveElectricityRate([def], mondayNoon, TZ)?.name).toBe('flat');
  });

  it('selects the peak period during peak hours', () => {
    const def = period({ id: 1, name: 'flat', restrictions: null });
    const peak = period({
      id: 2,
      name: 'peak',
      ratePerKwh: '0.30',
      restrictions: { timeRange: { startTime: '09:00', endTime: '17:00' } },
    });
    expect(resolveElectricityRate([def, peak], mondayNoon, TZ)?.name).toBe('peak');
  });

  it('falls back to default outside peak hours', () => {
    const def = period({ id: 1, name: 'flat', restrictions: null });
    const peak = period({
      id: 2,
      name: 'peak',
      restrictions: { timeRange: { startTime: '09:00', endTime: '17:00' } },
    });
    expect(resolveElectricityRate([def, peak], mondayEvening, TZ)?.name).toBe('flat');
  });

  it('matches a daysOfWeek + timeRange period on the right day', () => {
    const def = period({ id: 1, name: 'flat', restrictions: null });
    const weekday = period({
      id: 2,
      name: 'weekday-peak',
      restrictions: {
        timeRange: { startTime: '08:00', endTime: '18:00' },
        daysOfWeek: [1, 2, 3, 4, 5],
      },
    });
    expect(resolveElectricityRate([def, weekday], mondayNoon, TZ)?.name).toBe('weekday-peak');
  });

  it('skips a daysOfWeek period on the wrong day', () => {
    const def = period({ id: 1, name: 'flat', restrictions: null });
    const weekend = period({
      id: 2,
      name: 'weekend',
      restrictions: { timeRange: { startTime: '08:00', endTime: '18:00' }, daysOfWeek: [0, 6] },
    });
    expect(resolveElectricityRate([def, weekend], mondayNoon, TZ)?.name).toBe('flat');
  });

  it('orders by priority so the more specific period wins', () => {
    const def = period({ id: 1, name: 'flat', restrictions: null }); // priority 0
    const peak = period({
      id: 2,
      name: 'peak',
      restrictions: { timeRange: { startTime: '00:00', endTime: '23:00' } }, // priority 10
    });
    const resolved = resolveElectricityRate([peak, def], mondayNoon, TZ);
    expect(resolved?.priority).toBe(10);
    expect(resolved?.name).toBe('peak');
  });

  it('handles a midnight-crossing time range', () => {
    const night = period({
      id: 1,
      name: 'night',
      restrictions: { timeRange: { startTime: '22:00', endTime: '06:00' } },
    });
    expect(resolveElectricityRate([night], mondayLateNight, TZ)?.name).toBe('night');
    expect(resolveElectricityRate([night], mondayNoon, TZ)).toBeNull();
  });
});

describe('deriveElectricityRatePriority', () => {
  it('maps restriction shape to priority', () => {
    expect(deriveElectricityRatePriority(null)).toBe(0);
    expect(
      deriveElectricityRatePriority({ timeRange: { startTime: '09:00', endTime: '17:00' } }),
    ).toBe(10);
    expect(
      deriveElectricityRatePriority({
        timeRange: { startTime: '09:00', endTime: '17:00' },
        daysOfWeek: [1],
      }),
    ).toBe(20);
    expect(
      deriveElectricityRatePriority({ dateRange: { startDate: '06-01', endDate: '09-30' } }),
    ).toBe(30);
  });
});

describe('calculateElectricityCostCents', () => {
  it('computes 10 kWh at $0.12/kWh as 120 cents', () => {
    expect(calculateElectricityCostCents(10000, '0.12')).toBe(120);
  });

  it('rounds to the nearest cent', () => {
    // 1234 Wh = 1.234 kWh * $0.10 = $0.1234 -> 12.34 cents -> 12
    expect(calculateElectricityCostCents(1234, '0.10')).toBe(12);
    // 1.5 kWh * $0.077 = $0.1155 -> 11.55 cents -> 12
    expect(calculateElectricityCostCents(1500, '0.077')).toBe(12);
  });

  it('returns 0 for zero energy', () => {
    expect(calculateElectricityCostCents(0, '0.30')).toBe(0);
  });

  it('handles fractional kWh and sub-dollar rates', () => {
    expect(calculateElectricityCostCents(500, '0.20')).toBe(10);
  });
});
