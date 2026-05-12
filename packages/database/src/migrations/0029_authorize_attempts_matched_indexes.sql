CREATE INDEX IF NOT EXISTS "idx_authorize_attempts_matched_token_id" ON "authorize_attempts" ("matched_token_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_authorize_attempts_matched_driver_id" ON "authorize_attempts" ("matched_driver_id");
