-- Renames: preserve existing operator-tuned values
UPDATE settings SET key = 'stationMessage.enabled', updated_at = NOW()
  WHERE key = 'pricing.pushDisplayEnabled';
UPDATE settings SET key = 'stationMessage.pricingFormat', updated_at = NOW()
  WHERE key = 'pricing.displayFormat';

-- New keys: insert defaults only when absent (don't clobber)
INSERT INTO settings (key, value) VALUES
  ('stationMessage.charging.refreshSeconds', '30'::jsonb),
  ('stationMessage.brandLine', '""'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Defensive defaults for the renamed keys when nothing existed before
INSERT INTO settings (key, value) VALUES
  ('stationMessage.enabled', 'false'::jsonb),
  ('stationMessage.pricingFormat', '"compact"'::jsonb)
ON CONFLICT (key) DO NOTHING;
