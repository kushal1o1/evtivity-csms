CREATE TYPE "public"."reservation_audit_action" AS ENUM('created', 'updated', 'cancelled', 'expired', 'used');--> statement-breakpoint
CREATE TYPE "public"."reservation_audit_actor" AS ENUM('operator', 'driver', 'system');--> statement-breakpoint
CREATE TABLE "reservation_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"reservation_id" text,
	"action" "reservation_audit_action" NOT NULL,
	"actor" "reservation_audit_actor" NOT NULL,
	"actor_user_id" text,
	"actor_driver_id" text,
	"driver_id_before" text,
	"driver_id_after" text,
	"token_id_before" text,
	"token_id_after" text,
	"evse_id_before" text,
	"evse_id_after" text,
	"status_before" varchar(30),
	"status_after" varchar(30),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_reservation_audit_reservation_id" ON "reservation_audit_log" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "idx_reservation_audit_created_at" ON "reservation_audit_log" USING btree ("created_at");