// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encryptString } from '@evtivity/lib';

const configState = vi.hoisted(() => ({ SETTINGS_ENCRYPTION_KEY: 'unit-test-key' }));

vi.mock('../lib/config.js', () => ({
  config: configState,
}));

import {
  isEncryptedAtRest,
  decryptForRead,
  encryptForWrite,
  clearSettingsDecryptCache,
} from '../lib/settings-crypto.js';

beforeEach(() => {
  configState.SETTINGS_ENCRYPTION_KEY = 'unit-test-key';
  clearSettingsDecryptCache();
});

describe('isEncryptedAtRest', () => {
  it('returns true for keys ending in Enc', () => {
    expect(isEncryptedAtRest('smtp.passwordEnc')).toBe(true);
    expect(isEncryptedAtRest('stripe.secretKeyEnc')).toBe(true);
  });

  it('returns false for plain keys', () => {
    expect(isEncryptedAtRest('stripe.publishableKey')).toBe(false);
    expect(isEncryptedAtRest('company.name')).toBe(false);
  });
});

describe('encryptForWrite', () => {
  it('passes through non-Enc keys unchanged', () => {
    expect(encryptForWrite('company.name', 'EVtivity')).toBe('EVtivity');
  });

  it('passes through empty-string values for Enc keys', () => {
    expect(encryptForWrite('smtp.passwordEnc', '')).toBe('');
  });

  it('passes through non-string values for Enc keys', () => {
    expect(encryptForWrite('smtp.passwordEnc', 12345)).toBe(12345);
    expect(encryptForWrite('smtp.passwordEnc', null)).toBeNull();
  });

  it('encrypts a string value for an Enc key (produces ciphertext that round-trips)', () => {
    const cipher = encryptForWrite('smtp.passwordEnc', 'secret-pw') as string;
    expect(typeof cipher).toBe('string');
    expect(cipher).not.toBe('secret-pw');
    // Round-trips back to plaintext via decryptForRead.
    expect(decryptForRead('smtp.passwordEnc', cipher)).toBe('secret-pw');
  });

  it('throws when the encryption key is missing on an Enc write', () => {
    configState.SETTINGS_ENCRYPTION_KEY = '';
    expect(() => encryptForWrite('smtp.passwordEnc', 'secret')).toThrow(
      'SETTINGS_ENCRYPTION_KEY is required to write *Enc settings',
    );
  });
});

describe('decryptForRead', () => {
  it('passes through non-Enc keys unchanged', () => {
    expect(decryptForRead('company.name', 'EVtivity')).toBe('EVtivity');
  });

  it('passes through empty-string values for Enc keys', () => {
    expect(decryptForRead('smtp.passwordEnc', '')).toBe('');
  });

  it('passes through non-string values for Enc keys', () => {
    expect(decryptForRead('smtp.passwordEnc', 42)).toBe(42);
    expect(decryptForRead('smtp.passwordEnc', undefined)).toBeUndefined();
  });

  it('passes the ciphertext through unchanged when the encryption key is missing', () => {
    configState.SETTINGS_ENCRYPTION_KEY = '';
    const cipher = encryptString('plaintext', 'unit-test-key');
    expect(decryptForRead('smtp.passwordEnc', cipher)).toBe(cipher);
  });

  it('decrypts ciphertext for an Enc key', () => {
    const cipher = encryptString('my-secret', 'unit-test-key');
    expect(decryptForRead('smtp.passwordEnc', cipher)).toBe('my-secret');
  });

  it('caches decrypted values so the second read returns the same plaintext', () => {
    const cipher = encryptString('cached-secret', 'unit-test-key');
    const first = decryptForRead('twilio.authTokenEnc', cipher);
    const second = decryptForRead('twilio.authTokenEnc', cipher);
    expect(first).toBe('cached-secret');
    expect(second).toBe('cached-secret');
  });

  it('clearSettingsDecryptCache forces a fresh decrypt', () => {
    const cipher = encryptString('clearme', 'unit-test-key');
    expect(decryptForRead('s3.secretAccessKeyEnc', cipher)).toBe('clearme');
    clearSettingsDecryptCache();
    expect(decryptForRead('s3.secretAccessKeyEnc', cipher)).toBe('clearme');
  });

  it('evicts the oldest entry when the cache exceeds its bound', () => {
    // Fill beyond DECRYPT_CACHE_MAX (256) distinct ciphertexts to exercise the
    // LRU eviction branch, then confirm a later read still decrypts correctly.
    // scrypt key derivation makes each decrypt ~30-50ms, so this loop is slow.
    for (let i = 0; i < 258; i++) {
      const cipher = encryptString(`secret-${String(i)}`, 'unit-test-key');
      expect(decryptForRead('smtp.passwordEnc', cipher)).toBe(`secret-${String(i)}`);
    }
    const final = encryptString('final-secret', 'unit-test-key');
    expect(decryptForRead('smtp.passwordEnc', final)).toBe('final-secret');
  }, 30_000);
});
