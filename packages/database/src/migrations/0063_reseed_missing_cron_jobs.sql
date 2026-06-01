-- Re-seed every cronjobs row that earlier migrations inserted, idempotently.
--
-- Why: at least one operator's database ended up with most of the cronjobs
-- table wiped (only a handful of recent rows remained, MAX(id) >> COUNT(*)).
-- The scheduler only registers BullMQ schedulers for rows actually present
-- in the table, so when a row disappears its handler silently stops running.
-- The user-visible symptom: dashboard Trend and Historical modes show "No
-- Data" forever because the `dashboard-snapshot` row was missing and the
-- snapshot handler never fired.
--
-- This migration mirrors 0038's pattern but extends it to every cronjob the
-- workspace currently expects, including the ones added after 0038. Each
-- INSERT is gated on `NOT EXISTS` so re-running against a fully-seeded
-- database is a no-op, and existing schedules are never overwritten.

-- 0001
INSERT INTO cronjobs (name, schedule, status, next_run_at)
SELECT 'tariff-boundary-check', '* * * * *', 'pending', NOW()
WHERE NOT EXISTS (SELECT 1 FROM cronjobs WHERE name = 'tariff-boundary-check');

INSERT INTO cronjobs (name, schedule, status, next_run_at)
SELECT 'guest-session-cleanup', '*/5 * * * *', 'pending', NOW()
WHERE NOT EXISTS (SELECT 1 FROM cronjobs WHERE name = 'guest-session-cleanup');

-- 0006
INSERT INTO cronjobs (name, schedule, status, next_run_at)
SELECT 'reservation-expiry-check', '* * * * *', 'pending', NOW()
WHERE NOT EXISTS (SELECT 1 FROM cronjobs WHERE name = 'reservation-expiry-check');

INSERT INTO cronjobs (name, schedule, status, next_run_at)
SELECT 'offline-command-cleanup', '*/5 * * * *', 'pending', NOW()
WHERE NOT EXISTS (SELECT 1 FROM cronjobs WHERE name = 'offline-command-cleanup');

INSERT INTO cronjobs (name, schedule, status, next_run_at)
SELECT 'certificate-expiration-check', '0 * * * *', 'pending', NOW()
WHERE NOT EXISTS (SELECT 1 FROM cronjobs WHERE name = 'certificate-expiration-check');

-- 0011
INSERT INTO cronjobs (name, schedule, status, next_run_at)
SELECT 'station-message-charging-refresh', '*/30 * * * * *', 'pending', NOW()
WHERE NOT EXISTS (SELECT 1 FROM cronjobs WHERE name = 'station-message-charging-refresh');

-- 0019
INSERT INTO cronjobs (name, schedule, status, next_run_at)
SELECT 'payment-capture-retry', '30 3 * * *', 'pending', NOW() + INTERVAL '1 day'
WHERE NOT EXISTS (SELECT 1 FROM cronjobs WHERE name = 'payment-capture-retry');

-- 0033
INSERT INTO cronjobs (name, schedule, status, next_run_at)
SELECT 'audit-retention-prune', '0 3 * * *', 'pending', NOW() + INTERVAL '1 day'
WHERE NOT EXISTS (SELECT 1 FROM cronjobs WHERE name = 'audit-retention-prune');

-- 0037 + shift in 0056
INSERT INTO cronjobs (name, schedule, status, next_run_at)
SELECT 'dashboard-snapshot', '0 11 * * *', 'pending', NOW() + INTERVAL '5 minutes'
WHERE NOT EXISTS (SELECT 1 FROM cronjobs WHERE name = 'dashboard-snapshot');

-- 0038
INSERT INTO cronjobs (name, schedule, status, next_run_at)
SELECT 'report-scheduler', '*/5 * * * *', 'pending', NOW()
WHERE NOT EXISTS (SELECT 1 FROM cronjobs WHERE name = 'report-scheduler');

INSERT INTO cronjobs (name, schedule, status, next_run_at)
SELECT 'payment-reconciliation', '0 4 * * *', 'pending', NOW() + INTERVAL '1 day'
WHERE NOT EXISTS (SELECT 1 FROM cronjobs WHERE name = 'payment-reconciliation');

INSERT INTO cronjobs (name, schedule, status, next_run_at)
SELECT 'charging-profile-reconciliation', '0 */6 * * *', 'pending', NOW()
WHERE NOT EXISTS (SELECT 1 FROM cronjobs WHERE name = 'charging-profile-reconciliation');

INSERT INTO cronjobs (name, schedule, status, next_run_at)
SELECT 'config-drift-detection', '0 */6 * * *', 'pending', NOW()
WHERE NOT EXISTS (SELECT 1 FROM cronjobs WHERE name = 'config-drift-detection');

INSERT INTO cronjobs (name, schedule, status, next_run_at)
SELECT 'stale-session-cleanup', '*/15 * * * *', 'pending', NOW()
WHERE NOT EXISTS (SELECT 1 FROM cronjobs WHERE name = 'stale-session-cleanup');

-- 0050
INSERT INTO cronjobs (name, schedule, status, next_run_at)
SELECT 'log-retention-prune', '30 3 * * *', 'pending', NOW() + INTERVAL '1 day'
WHERE NOT EXISTS (SELECT 1 FROM cronjobs WHERE name = 'log-retention-prune');

-- 0054
INSERT INTO cronjobs (name, schedule, status, next_run_at)
SELECT 'mfa-challenge-prune', '*/5 * * * *', 'pending', NOW()
WHERE NOT EXISTS (SELECT 1 FROM cronjobs WHERE name = 'mfa-challenge-prune');

-- 0055
INSERT INTO cronjobs (name, schedule, status, next_run_at)
SELECT 'refresh-token-prune', '45 4 * * *', 'pending', NOW() + INTERVAL '1 day'
WHERE NOT EXISTS (SELECT 1 FROM cronjobs WHERE name = 'refresh-token-prune');

-- 0059
INSERT INTO cronjobs (name, schedule, status, next_run_at)
SELECT 'maintenance-scheduler', '* * * * *', 'pending', NOW() + INTERVAL '1 minute'
WHERE NOT EXISTS (SELECT 1 FROM cronjobs WHERE name = 'maintenance-scheduler');
