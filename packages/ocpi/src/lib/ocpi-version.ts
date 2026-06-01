// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import type { OcpiVersion } from '../types/ocpi.js';

// Normalize a partner's stored OCPI version into the strict OcpiVersion union.
// `ocpi_partners.version` is a free-text column (older rows may be null or
// hold a string that doesn't match the negotiated set). Falling back to
// 2.2.1 keeps the wire format compatible with every supported partner.
export function resolvePartnerVersion(version: string | null | undefined): OcpiVersion {
  return version === '2.3.0' ? '2.3.0' : '2.2.1';
}
