-- Seed default electricity rate periods for the baseline site, mirroring the
-- pricing baseline (groups + tariffs) in 0001_seed_defaults.sql. Rate periods
-- are per-site, so they attach to the baseline site_000000000001 (Main Office),
-- the only site guaranteed to exist at migration time. A flat default plus one
-- weekday peak period demonstrates time-of-use resolution out of the box.
-- Idempotent via NOT EXISTS guards: the table has a serial PK and no natural
-- unique key, so ON CONFLICT cannot dedupe re-inserts.

INSERT INTO site_electricity_rate_periods (site_id, name, rate_per_kwh, restrictions, priority, is_default)
SELECT 'sit_000000000001', 'Standard', 0.120000, NULL, 0, true
WHERE EXISTS (SELECT 1 FROM sites WHERE id = 'sit_000000000001')
  AND NOT EXISTS (
    SELECT 1 FROM site_electricity_rate_periods
    WHERE site_id = 'sit_000000000001' AND name = 'Standard'
  );
--> statement-breakpoint
INSERT INTO site_electricity_rate_periods (site_id, name, rate_per_kwh, restrictions, priority, is_default)
SELECT 'sit_000000000001', 'Weekday Peak', 0.220000,
  '{"timeRange":{"startTime":"16:00","endTime":"21:00"},"daysOfWeek":[1,2,3,4,5]}'::jsonb, 20, false
WHERE EXISTS (SELECT 1 FROM sites WHERE id = 'sit_000000000001')
  AND NOT EXISTS (
    SELECT 1 FROM site_electricity_rate_periods
    WHERE site_id = 'sit_000000000001' AND name = 'Weekday Peak'
  );
