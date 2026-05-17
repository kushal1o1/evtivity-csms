-- Deduplicate meter_values and add a unique constraint so retransmits from
-- the OCPP layer (allowed by spec on connection loss before CALLRESULT) can no
-- longer create duplicate rows that inflate energy / cost / OCPI CDRs.
--
-- 1) Remove existing duplicate rows, keeping the earliest id per logical key.
--    Tuple = (session_id, evse_id, timestamp, measurand, phase, location).
--    NULLs are treated as equal here via COALESCE on the comparison.
DELETE FROM meter_values mv
USING (
  SELECT id,
         row_number() OVER (
           PARTITION BY
             COALESCE(session_id, ''),
             COALESCE(evse_id, ''),
             timestamp,
             COALESCE(measurand, ''),
             COALESCE(phase, ''),
             COALESCE(location, '')
           ORDER BY id ASC
         ) AS rn
  FROM meter_values
) dup
WHERE mv.id = dup.id AND dup.rn > 1;

-- 2) Add a unique index with NULLS NOT DISTINCT (PG 15+) so the insert path
--    can use ON CONFLICT DO NOTHING and inserts that race the same tuple are
--    correctly deduped.
CREATE UNIQUE INDEX IF NOT EXISTS meter_values_dedup_idx
  ON meter_values (session_id, evse_id, timestamp, measurand, phase, location)
  NULLS NOT DISTINCT;
