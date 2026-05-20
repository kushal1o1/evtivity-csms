-- Two new cancel reasons covering states the worker can now detect at
-- activation time before sending ReserveNow:
--
--   evse_in_use_at_activation
--     The reserved EVSE was still occupied (cable plugged in or a session by
--     a different driver in progress) when the worker fired. The worker
--     decided up front rather than letting the station reject with
--     `Occupied`, which gives the driver a clearer reason and avoids a stale
--     `active` row between dispatch and the projection's rollback.
--
--   station_faulted_at_activation
--     The reserved EVSE was Faulted or Unavailable at activation time.
--     ReserveNow against either state would also return non-Accepted, so the
--     worker short-circuits with a reason that identifies the actual cause.
--
-- ALTER TYPE ADD VALUE is non-transactional in Postgres and idempotent via
-- IF NOT EXISTS, matching the pattern used by earlier enum-expanding
-- migrations in this repo.

ALTER TYPE reservation_cancel_reason ADD VALUE IF NOT EXISTS 'evse_in_use_at_activation';
ALTER TYPE reservation_cancel_reason ADD VALUE IF NOT EXISTS 'station_faulted_at_activation';
