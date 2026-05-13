-- Add 'pricing_assignment' to the pricing_audit_entity enum so that
-- assigning or removing a pricing group on a station/site/driver/fleet
-- can be recorded in pricing_audit_log alongside group/tariff/holiday CRUD.
-- IF NOT EXISTS makes the migration safe to re-run after a partial failure.
ALTER TYPE "pricing_audit_entity" ADD VALUE IF NOT EXISTS 'pricing_assignment';
