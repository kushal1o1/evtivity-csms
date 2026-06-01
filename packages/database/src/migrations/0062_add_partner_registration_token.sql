-- Adds an encrypted field on ocpi_partners for the partner's out-of-band
-- registration token (OCPI 2.2.1 "Token C"). Required when the operator
-- initiates outbound registration: WE are the Sender, the partner shared
-- this token with us so we can call their /credentials endpoint.
--
-- Stored encrypted at rest via the existing SETTINGS_ENCRYPTION_KEY pattern.
-- The Enc suffix in the column name follows the established convention
-- (`*Enc` columns are AES-256-GCM ciphertext; the runtime decrypts before
-- use and never logs the plaintext).
ALTER TABLE ocpi_partners
  ADD COLUMN IF NOT EXISTS partner_registration_token_enc text;
