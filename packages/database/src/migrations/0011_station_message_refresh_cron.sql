-- Register the in-session charging-state station message refresh cron job.
-- The cron pattern uses 6 fields (seconds-precision) so BullMQ's cron-parser
-- fires every 30 seconds. The handler internally honours
-- `stationMessage.charging.refreshSeconds` per-station so operators can tune
-- the effective rate without changing the cron schedule.
INSERT INTO cronjobs (name, schedule, status, next_run_at) VALUES
  ('station-message-charging-refresh', '*/30 * * * * *', 'pending', now())
ON CONFLICT DO NOTHING;
