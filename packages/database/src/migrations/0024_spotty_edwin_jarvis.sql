CREATE TYPE "public"."authorize_outcome" AS ENUM('accepted', 'invalid', 'blocked', 'expired', 'no_credit', 'concurrent_tx', 'unknown', 'db_error');--> statement-breakpoint
CREATE TYPE "public"."token_audit_action" AS ENUM('created', 'updated', 'activated', 'deactivated', 'revoked', 'deleted', 'imported');--> statement-breakpoint
CREATE TYPE "public"."token_audit_actor" AS ENUM('operator', 'driver', 'system');--> statement-breakpoint
CREATE TABLE "authorize_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"station_id" text,
	"id_token" varchar(255) NOT NULL,
	"token_type" varchar(20),
	"matched_token_id" text,
	"outcome" "authorize_outcome" NOT NULL,
	"ocpp_version" varchar(10),
	"reason" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_id" text,
	"id_token_snapshot" varchar(255) NOT NULL,
	"token_type_snapshot" varchar(20) NOT NULL,
	"driver_id_snapshot" text,
	"action" "token_audit_action" NOT NULL,
	"actor" "token_audit_actor" NOT NULL,
	"actor_user_id" text,
	"actor_driver_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "driver_tokens" DROP CONSTRAINT "driver_tokens_driver_id_drivers_id_fk";
--> statement-breakpoint
ALTER TABLE "driver_tokens" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "driver_tokens" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "driver_tokens" ADD COLUMN "revoked_reason" varchar(100);--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "token_id" text;--> statement-breakpoint
CREATE INDEX "idx_authorize_attempts_station_id" ON "authorize_attempts" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "idx_authorize_attempts_id_token" ON "authorize_attempts" USING btree ("id_token");--> statement-breakpoint
CREATE INDEX "idx_authorize_attempts_outcome" ON "authorize_attempts" USING btree ("outcome");--> statement-breakpoint
CREATE INDEX "idx_authorize_attempts_created_at" ON "authorize_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_token_audit_token_id" ON "token_audit_log" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "idx_token_audit_created_at" ON "token_audit_log" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "driver_tokens" ADD CONSTRAINT "driver_tokens_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_token_id_driver_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."driver_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_driver_tokens_expires_at" ON "driver_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_reservations_token_id" ON "reservations" USING btree ("token_id");--> statement-breakpoint
INSERT INTO driver_event_settings (event_type, is_enabled) VALUES
  ('token.Added', true),
  ('token.Removed', true),
  ('token.Deactivated', true)
ON CONFLICT (event_type) DO NOTHING;