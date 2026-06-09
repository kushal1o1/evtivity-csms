// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

export interface ZonedComponents {
  hour: number;
  minute: number;
  dayOfWeek: number;
  monthDay: string;
  isoDate: string;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function timeToMinutes(time: string): number {
  const [hoursStr, minutesStr] = time.split(':');
  return Number(hoursStr) * 60 + Number(minutesStr);
}

/**
 * Extract calendar components in the given timezone. Without a timezone the
 * server's local time is used. Pass the site's timezone -- typically
 * `sites.timezone`, e.g. 'America/Los_Angeles' -- so windows are evaluated
 * where the driver actually plugs in, not where the server happens to live.
 */
export function getZonedComponents(now: Date, timezone?: string): ZonedComponents {
  if (timezone == null) {
    return {
      hour: now.getHours(),
      minute: now.getMinutes(),
      dayOfWeek: now.getDay(),
      monthDay: `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
      isoDate: `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    };
  }
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  const hour = Number(get('hour')) % 24;
  return {
    hour,
    minute: Number(get('minute')),
    dayOfWeek: WEEKDAY_INDEX[get('weekday')] ?? 0,
    monthDay: `${get('month')}-${get('day')}`,
    isoDate: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

export function isInTimeRange(zc: ZonedComponents, startTime: string, endTime: string): boolean {
  const currentMinutes = zc.hour * 60 + zc.minute;
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  // Midnight-crossing range (e.g., 22:00-06:00)
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

export function isInDateRange(zc: ZonedComponents, startDate: string, endDate: string): boolean {
  const currentMD = zc.monthDay;

  if (startDate <= endDate) {
    return currentMD >= startDate && currentMD <= endDate;
  }
  // Wrapping range (e.g., 11-01 to 03-31)
  return currentMD >= startDate || currentMD <= endDate;
}
