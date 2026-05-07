CREATE TABLE "station_message_pushes" (
	"id" serial PRIMARY KEY NOT NULL,
	"station_id" text NOT NULL,
	"state" varchar(20) NOT NULL,
	"ocpp_message_id" integer NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"pushed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "station_message_pushes" ADD CONSTRAINT "station_message_pushes_station_id_charging_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."charging_stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_message_push_per_slot" ON "station_message_pushes" USING btree ("station_id","ocpp_message_id");