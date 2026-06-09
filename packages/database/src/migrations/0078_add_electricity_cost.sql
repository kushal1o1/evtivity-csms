CREATE TABLE IF NOT EXISTS "site_electricity_rate_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"name" varchar(100) NOT NULL,
	"rate_per_kwh" numeric(10, 6) NOT NULL,
	"restrictions" jsonb,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "site_electricity_rate_periods" ADD CONSTRAINT "site_electricity_rate_periods_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_electricity_rate_periods_site_id" ON "site_electricity_rate_periods" ("site_id");
--> statement-breakpoint
ALTER TABLE "charging_sessions" ADD COLUMN IF NOT EXISTS "electricity_cost_cents" integer;
--> statement-breakpoint
ALTER TABLE "dashboard_snapshots" ADD COLUMN IF NOT EXISTS "total_electricity_cost_cents" integer;
--> statement-breakpoint
ALTER TABLE "dashboard_snapshots" ADD COLUMN IF NOT EXISTS "day_electricity_cost_cents" integer;
