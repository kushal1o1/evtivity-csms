CREATE TABLE "station_message_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"state" varchar(20) NOT NULL,
	"body" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "station_message_templates_state_unique" UNIQUE("state")
);
--> statement-breakpoint
ALTER TABLE "station_message_templates" ADD CONSTRAINT "station_message_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;