-- Seed defaults for the per-log retention settings introduced alongside the
-- worker's log-retention-prune handler. Existing installs that predate this
-- migration would otherwise read undefined from `settings` and the prune
-- handler would fall back to its hardcoded DEFAULTS map; explicit INSERTs
-- here make the setting visible/editable in the Settings UI from day one.
--
-- ON CONFLICT DO NOTHING so operators who have already tuned these values
-- via the API or Settings UI are not overwritten.

INSERT INTO settings (key, value) VALUES
  ('logs.access.retentionDays', '30'::jsonb),
  ('logs.ocppMessage.retentionDays', '30'::jsonb),
  ('logs.connection.retentionDays', '90'::jsonb),
  ('logs.notifications.retentionDays', '90'::jsonb),
  ('logs.securityEvents.retentionDays', '365'::jsonb),
  ('logs.portStatus.retentionDays', '30'::jsonb),
  ('logs.workerJob.retentionDays', '30'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Register the cron entry so the worker scheduler actually runs the new
-- log-retention-prune handler. Runs daily at 03:30 UTC, 30 min after the
-- audit-retention-prune so they don't clash. NOT EXISTS guard keeps the
-- migration idempotent across re-applies.
INSERT INTO cronjobs (name, schedule, status, next_run_at)
SELECT 'log-retention-prune', '30 3 * * *', 'pending', NOW() + INTERVAL '1 day'
WHERE NOT EXISTS (SELECT 1 FROM cronjobs WHERE name = 'log-retention-prune');

-- Index `worker_job_logs.completed_at` so the prune handler's
-- `WHERE completed_at < cutoff` clause uses an index lookup instead of a
-- sequential scan. The handler intentionally prunes by `completed_at`
-- (not `started_at`) so in-flight rows -- which have `completed_at IS NULL`
-- -- are never deleted. The existing `idx_worker_job_logs_started_at`
-- doesn't cover this query shape.
CREATE INDEX IF NOT EXISTS idx_worker_job_logs_completed_at
  ON worker_job_logs (completed_at);
