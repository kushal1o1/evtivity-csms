-- Backfill the vehicle_efficiency_lookup catalog. The same INSERT exists in
-- 0001_seed_defaults.sql but was added after that migration had already been
-- applied to running deployments, so Drizzle never re-ran it (migration
-- hashes are content-addressed but already-applied migrations are skipped).
-- This migration ships the catalog as a separate, idempotent step.

INSERT INTO vehicle_efficiency_lookup (make, model, efficiency_mi_per_kwh) VALUES
  ('Tesla', 'Model 3', 4.0),
  ('Tesla', 'Model Y', 3.5),
  ('Tesla', 'Model S', 3.3),
  ('Tesla', 'Model X', 2.9),
  ('Chevrolet', 'Bolt EV', 3.9),
  ('Chevrolet', 'Bolt EUV', 3.6),
  ('Chevrolet', 'Equinox EV', 3.3),
  ('Nissan', 'Leaf', 3.5),
  ('Nissan', 'Ariya', 3.2),
  ('Ford', 'Mustang Mach-E', 3.0),
  ('Ford', 'F-150 Lightning', 2.2),
  ('Hyundai', 'Ioniq 5', 3.4),
  ('Hyundai', 'Ioniq 6', 4.0),
  ('Kia', 'EV6', 3.4),
  ('Kia', 'EV9', 2.6),
  ('BMW', 'iX', 2.8),
  ('BMW', 'i4', 3.5),
  ('Rivian', 'R1T', 2.3),
  ('Rivian', 'R1S', 2.3),
  ('Volkswagen', 'ID.4', 3.2),
  ('Mercedes-Benz', 'EQS', 3.2),
  ('Porsche', 'Taycan', 2.8),
  ('Lucid', 'Air', 4.6),
  ('Polestar', '2', 3.3)
ON CONFLICT DO NOTHING;
