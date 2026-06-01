// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import type { OcpiToken, OcpiTokenType, OcpiVersion } from '../types/ocpi.js';

interface DriverTokenRow {
  id: string;
  idToken: string;
  tokenType: string;
  isActive: boolean;
  expiresAt: Date | null;
  revokedAt: Date | null;
  updatedAt: Date;
}

interface TokenTransformInput {
  token: DriverTokenRow;
  countryCode: string;
  partyId: string;
  driverName?: string;
}

const TOKEN_TYPE_MAP: Record<string, OcpiTokenType> = {
  ISO14443: 'RFID',
  ISO15693: 'RFID',
  eMAID: 'APP_USER',
  Central: 'OTHER',
  Local: 'OTHER',
  MacAddress: 'OTHER',
  NoAuthorization: 'AD_HOC_USER',
  KeyCode: 'OTHER',
};

function mapTokenType(tokenType: string): OcpiTokenType {
  return TOKEN_TYPE_MAP[tokenType] ?? 'RFID';
}

export function transformToken(input: TokenTransformInput, version: OcpiVersion): OcpiToken {
  const { token, countryCode, partyId } = input;

  // Mirror the same usability check the OCPP authorize handlers apply: a
  // card is only `valid` while active, not revoked, and not expired. Without
  // this, revoked or expired cards round-trip to partners as valid and
  // partners then attempt to authorize charging that the CSMS rejects at
  // the OCPP layer — drivers see an inconsistent experience.
  const now = Date.now();
  const valid =
    token.isActive &&
    token.revokedAt == null &&
    (token.expiresAt == null || token.expiresAt.getTime() > now);

  const result: OcpiToken = {
    country_code: countryCode,
    party_id: partyId,
    uid: token.idToken,
    type: mapTokenType(token.tokenType),
    contract_id: token.idToken,
    issuer: partyId,
    valid,
    whitelist: 'ALLOWED',
    last_updated: token.updatedAt.toISOString(),
  };

  if (version === '2.3.0') {
    // 2.3.0-specific token fields will be added here
  }

  return result;
}
