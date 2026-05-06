-- Move three periodic tasks from OCPP server setIntervals (which never ran
-- under Helm Deployment because the `isPrimary` heuristic relied on
-- StatefulSet-style pod names ending in `-0`) to BullMQ-managed worker cron
-- jobs (which enforce single execution across replicas via concurrency:1).
--
-- Handlers:
--   reservation-expiry-check     packages/worker/src/handlers/reservation-expiry-check.ts
--   offline-command-cleanup      packages/worker/src/handlers/offline-command-cleanup.ts
--   certificate-expiration-check packages/worker/src/handlers/certificate-expiration-check.ts
--
-- Schedules match the prior OCPP-server intervals:
--   reservation-expiry-check     every minute    (was 60s setInterval)
--   offline-command-cleanup      every 5 minutes (was 5min setInterval)
--   certificate-expiration-check every hour      (was 1h setInterval)
INSERT INTO cronjobs (name, schedule, status, next_run_at) VALUES
  ('reservation-expiry-check',     '* * * * *',   'pending', now()),
  ('offline-command-cleanup',      '*/5 * * * *', 'pending', now()),
  ('certificate-expiration-check', '0 * * * *',   'pending', now())
ON CONFLICT DO NOTHING;
