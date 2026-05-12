-- Enforce uniqueness on (id_token, token_type) for driver_tokens. The
-- application-side checks were inconsistent (portal had a duplicate guard,
-- operator routes did not), and the OCPP Authorize handler picks the first
-- row from a multi-row match, which is non-deterministic. The unique index
-- closes both gaps at the storage layer.
--
-- Step 1: deduplicate any existing rows by keeping the most recently
-- updated entry per (id_token, token_type) and deleting the rest. Older
-- duplicates are removed rather than renamed so the constraint can be
-- created cleanly. This is safe because duplicates were always
-- ambiguous from the lookup side anyway.

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY id_token, token_type
           ORDER BY updated_at DESC, created_at DESC, id ASC
         ) AS rn
  FROM driver_tokens
)
DELETE FROM driver_tokens
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_tokens_id_token_type
  ON driver_tokens (id_token, token_type);
