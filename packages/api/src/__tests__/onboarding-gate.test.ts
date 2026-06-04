// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyReply } from 'fastify';
import { checkStationOnboarded } from '../lib/onboarding-gate.js';

function makeReply(): {
  reply: FastifyReply;
  send: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
} {
  const send = vi.fn(async () => undefined);
  const status = vi.fn(() => ({ send }));
  const reply = { status } as unknown as FastifyReply;
  return { reply, send, status };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkStationOnboarded', () => {
  it('returns true and sends nothing when station is accepted', async () => {
    const { reply, status } = makeReply();
    const result = await checkStationOnboarded({ onboardingStatus: 'accepted' }, reply);
    expect(result).toBe(true);
    expect(status).not.toHaveBeenCalled();
  });

  it('returns false with 403 STATION_PENDING when pending', async () => {
    const { reply, send, status } = makeReply();
    const result = await checkStationOnboarded({ onboardingStatus: 'pending' }, reply);
    expect(result).toBe(false);
    expect(status).toHaveBeenCalledWith(403);
    expect(send).toHaveBeenCalledWith({
      error: 'Station is pending approval',
      code: 'STATION_PENDING',
    });
  });

  it('returns false with 403 STATION_BLOCKED for a blocked status', async () => {
    const { reply, send, status } = makeReply();
    const result = await checkStationOnboarded({ onboardingStatus: 'blocked' }, reply);
    expect(result).toBe(false);
    expect(status).toHaveBeenCalledWith(403);
    expect(send).toHaveBeenCalledWith({ error: 'Station is blocked', code: 'STATION_BLOCKED' });
  });

  it('treats a null status as blocked', async () => {
    const { reply, send } = makeReply();
    const result = await checkStationOnboarded({ onboardingStatus: null }, reply);
    expect(result).toBe(false);
    expect(send).toHaveBeenCalledWith({ error: 'Station is blocked', code: 'STATION_BLOCKED' });
  });

  it('treats an unknown status as blocked', async () => {
    const { reply, send } = makeReply();
    const result = await checkStationOnboarded({ onboardingStatus: 'rejected' }, reply);
    expect(result).toBe(false);
    expect(send).toHaveBeenCalledWith({ error: 'Station is blocked', code: 'STATION_BLOCKED' });
  });
});
