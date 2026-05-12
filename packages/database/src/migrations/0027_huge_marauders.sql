ALTER TABLE "reservation_audit_log" ADD COLUMN "expires_at_before" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservation_audit_log" ADD COLUMN "expires_at_after" timestamp with time zone;--> statement-breakpoint
INSERT INTO driver_event_settings (event_type, is_enabled) VALUES
  ('token.Reactivated', true)
ON CONFLICT (event_type) DO NOTHING;