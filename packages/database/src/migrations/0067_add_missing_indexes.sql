-- Add four missing indexes flagged by the Domain 26 schema review:
--   * vehicles.driver_id   -- per-driver vehicle lookups (portal account page)
--   * reservations.expires_at  -- expiry-check cron range scans
--   * config_template_push_stations.status  -- push progress filtering
--   * charging_profile_push_stations.status  -- push progress filtering
--
-- All are mandated by .claude/rules/database.md (index FKs, status, and
-- frequently filtered columns). Idempotent so a redeploy on an already-
-- patched database is a no-op.

CREATE INDEX IF NOT EXISTS idx_vehicles_driver_id
  ON vehicles (driver_id);

CREATE INDEX IF NOT EXISTS idx_reservations_expires_at
  ON reservations (expires_at);

CREATE INDEX IF NOT EXISTS idx_config_template_push_stations_status
  ON config_template_push_stations (status);

CREATE INDEX IF NOT EXISTS idx_cp_push_stations_status
  ON charging_profile_push_stations (status);
