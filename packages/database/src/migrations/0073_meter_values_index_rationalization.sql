CREATE INDEX IF NOT EXISTS "idx_meter_values_station_measurand_ts" ON "meter_values" ("station_id","measurand","timestamp");
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_meter_values_station_id";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_meter_values_session_id";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ocpp_message_logs_message_id";
