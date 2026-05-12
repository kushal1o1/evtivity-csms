ALTER TABLE "charging_sessions" ADD COLUMN "vehicle_id" text;--> statement-breakpoint
ALTER TABLE "charging_sessions" ADD CONSTRAINT "charging_sessions_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sessions_vehicle_id" ON "charging_sessions" USING btree ("vehicle_id");