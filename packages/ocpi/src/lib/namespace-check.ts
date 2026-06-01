// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

// Per OCPI 2.2.1 §3.1.5, the (country_code, party_id) tuple in module URLs
// MUST identify the SENDER party. For receiver endpoints (PUT/PATCH/POST/
// DELETE on eMSP locations/sessions/tariffs and CPO tokens), the URL
// namespace must therefore match the credentials that the request
// authenticated with. Without this guard a partner could mis-tag rows in
// its own namespace (writes are already partner-scoped so this is not a
// data leak, but the resulting rows lie about provenance and break
// downstream lookups by `(country_code, party_id, uid)`).
export function namespaceMismatch(
  partner: { countryCode: string | null; partyId: string | null } | undefined | null,
  country_code: string,
  party_id: string,
): boolean {
  if (partner == null) return true;
  // Partners that registered without a confirmed country_code / party_id
  // (status='pending' before the credentials handshake completes) cannot
  // make namespace claims yet. Treat as mismatch to fail closed.
  if (partner.countryCode == null || partner.partyId == null) return true;
  return partner.countryCode !== country_code || partner.partyId !== party_id;
}
