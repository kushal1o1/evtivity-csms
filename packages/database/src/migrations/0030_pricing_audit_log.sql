CREATE TYPE "pricing_audit_entity" AS ENUM ('pricing_group', 'tariff', 'holiday');--> statement-breakpoint
CREATE TYPE "pricing_audit_action" AS ENUM ('created', 'updated', 'deleted');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pricing_audit_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "entity_type" "pricing_audit_entity" NOT NULL,
  "entity_id" text NOT NULL,
  "action" "pricing_audit_action" NOT NULL,
  "actor_user_id" text,
  "before" jsonb,
  "after" jsonb,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pricing_audit_entity" ON "pricing_audit_log" ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pricing_audit_created_at" ON "pricing_audit_log" ("created_at");
