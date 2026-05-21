-- Seed the portal driver self-registration toggle. Defaulting to true keeps
-- existing installs working unchanged; closed/managed deployments where
-- drivers are admin-provisioned can flip this to false to have the portal
-- /v1/portal/auth/register endpoint return 403 PORTAL_REGISTRATION_DISABLED.
--
-- ON CONFLICT DO NOTHING so operators who explicitly toggled the value via
-- the Settings UI between releases keep their preference.

INSERT INTO settings (key, value) VALUES
  ('portal.registrationEnabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
