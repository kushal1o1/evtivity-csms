-- Add reservation_id_seq sequence used by `getNextReservationId()` in
-- `packages/api/src/routes/reservations.ts`. The sequence was missing from
-- 0001_seed_defaults.sql when the schema was squashed, so existing installs
-- have a `reservation_id_seq does not exist` error on every reservation
-- create. This migration backfills it without touching the squashed initial
-- migration (existing installs will not re-run 0001).
CREATE SEQUENCE IF NOT EXISTS reservation_id_seq START WITH 1;
