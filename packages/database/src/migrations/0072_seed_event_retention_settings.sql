INSERT INTO settings (key, value) VALUES
  ('logs.domainEvents.retentionDays', '30'::jsonb),
  ('logs.meterValues.retentionDays', '90'::jsonb)
ON CONFLICT (key) DO NOTHING;
