// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import crypto from 'node:crypto';

/**
 * Single source of truth for the user-token / driver-token random+hash
 * generation used by password reset, email verification, and invitation
 * flows. Returns the raw token (embedded in the email link) and the SHA-256
 * hash (the value persisted in `user_tokens.token_hash`). The plaintext
 * raw token is never stored.
 *
 * 32 random bytes hex-encoded gives 64 chars / 256 bits of entropy — far
 * beyond brute-forceable within the 1-24h TTLs the callers use.
 */
export function generateUserToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hash: hashUserToken(raw) };
}

/**
 * Hash a user-supplied token from a recovery / verification link so it can
 * be compared against the SHA-256 hash stored in `user_tokens.token_hash`.
 */
export function hashUserToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}
