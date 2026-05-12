-- Add a nullable token_id FK on charging_sessions so the session detail
-- can show which driver_tokens row authorized the start. The OCPP
-- TransactionEvent Started projection sets it during driver resolution.
-- ON DELETE SET NULL keeps historic sessions intact when a token is later
-- removed from a driver.

ALTER TABLE "charging_sessions" ADD COLUMN IF NOT EXISTS "token_id" text;--> statement-breakpoint
ALTER TABLE "charging_sessions"
  ADD CONSTRAINT "charging_sessions_token_id_driver_tokens_id_fk"
  FOREIGN KEY ("token_id") REFERENCES "public"."driver_tokens"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_token_id" ON "charging_sessions" USING btree ("token_id");
