// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

let dbResults: unknown[][] = [];
let dbCallIndex = 0;

function setupDbResults(...results: unknown[][]) {
  dbResults = results;
  dbCallIndex = 0;
}

function makeChain() {
  const chain: Record<string, unknown> = {};
  const methods = [
    'select',
    'from',
    'where',
    'orderBy',
    'limit',
    'offset',
    'values',
    'returning',
    'set',
    'onConflictDoUpdate',
    'onConflictDoNothing',
    'delete',
    'insert',
    'update',
  ];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  let awaited = false;
  chain['then'] = (resolve?: (v: unknown) => unknown, reject?: (r: unknown) => unknown) => {
    if (!awaited) {
      awaited = true;
      const r = dbResults[dbCallIndex] ?? [];
      dbCallIndex++;
      return Promise.resolve(r).then(resolve, reject);
    }
    return Promise.resolve([]).then(resolve, reject);
  };
  chain['catch'] = (reject?: (r: unknown) => unknown) => Promise.resolve([]).catch(reject);
  return chain;
}

vi.mock('../middleware/rbac.js', () => ({
  authorize:
    () =>
    async (
      request: { jwtVerify: () => Promise<void> },
      reply: { status: (code: number) => { send: (body: unknown) => Promise<void> } },
    ) => {
      try {
        await request.jwtVerify();
      } catch {
        await reply.status(401).send({ error: 'Unauthorized' });
      }
    },
  invalidatePermissionCache: vi.fn(),
}));

vi.mock('@evtivity/database', () => ({
  db: {
    select: vi.fn(() => makeChain()),
    insert: vi.fn(() => makeChain()),
    update: vi.fn(() => makeChain()),
    delete: vi.fn(() => makeChain()),
  },
  stationMessageTemplates: {
    state: 'state',
    body: 'body',
    updatedAt: 'updatedAt',
    updatedBy: 'updatedBy',
  },
}));

vi.mock('@evtivity/lib', async () => {
  const actual = await vi.importActual<typeof import('@evtivity/lib')>('@evtivity/lib');
  return {
    ...actual,
    clearStationMessageCache: vi.fn(),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}));

import { registerAuth } from '../plugins/auth.js';
import { stationMessageTemplateRoutes } from '../routes/station-message-templates.js';
import { clearStationMessageCache as clearStationMessageCacheImport } from '@evtivity/lib';

const clearStationMessageCache = clearStationMessageCacheImport as unknown as ReturnType<
  typeof vi.fn
>;

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await registerAuth(app);
  stationMessageTemplateRoutes(app);
  await app.ready();
  return app;
}

describe('Station message template routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await buildApp();
    token = app.jwt.sign({ userId: 'usr_test', roleId: 'rol_test' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    setupDbResults();
    clearStationMessageCache.mockClear();
  });

  describe('GET /v1/station-message-templates', () => {
    it('returns 401 without token', async () => {
      const res = await app.inject({ method: 'GET', url: '/station-message-templates' });
      expect(res.statusCode).toBe(401);
    });

    it('returns the list of templates', async () => {
      const rows = [
        {
          state: 'available',
          body: 'Available body',
          updatedAt: '2026-01-01T00:00:00Z',
          updatedBy: 'usr_test',
        },
        {
          state: 'occupied',
          body: 'Occupied body',
          updatedAt: '2026-01-02T00:00:00Z',
          updatedBy: null,
        },
      ];
      setupDbResults(rows);
      const res = await app.inject({
        method: 'GET',
        url: '/station-message-templates',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].state).toBe('available');
    });
  });

  describe('PUT /v1/station-message-templates/:state', () => {
    it('returns 401 without token', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/station-message-templates/available',
        payload: { body: 'New' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 400 for an unknown state', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/station-message-templates/bogus-state',
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'New' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('upserts and clears the renderer cache', async () => {
      const upserted = {
        state: 'available',
        body: 'New body',
        updatedAt: '2026-01-01T00:00:00Z',
        updatedBy: 'usr_test',
      };
      setupDbResults([upserted]);
      const res = await app.inject({
        method: 'PUT',
        url: '/station-message-templates/available',
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'New body' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.body).toBe('New body');
      expect(body.state).toBe('available');
      expect(clearStationMessageCache).toHaveBeenCalledTimes(1);
    });
  });

  describe('DELETE /v1/station-message-templates/:state', () => {
    it('returns 401 without token', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/station-message-templates/available',
      });
      expect(res.statusCode).toBe(401);
    });

    it('resets to seed default and clears the renderer cache', async () => {
      const reset = {
        state: 'unavailable',
        body: 'Temporarily unavailable\n{{companyName}}',
        updatedAt: '2026-01-01T00:00:00Z',
        updatedBy: 'usr_test',
      };
      setupDbResults([reset]);
      const res = await app.inject({
        method: 'DELETE',
        url: '/station-message-templates/unavailable',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.body).toBe('Temporarily unavailable\n{{companyName}}');
      expect(clearStationMessageCache).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /v1/station-message-templates/preview', () => {
    it('returns 401 without token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/station-message-templates/preview',
        payload: { state: 'available', body: 'hi' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('renders with default sample variables', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/station-message-templates/preview',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          state: 'available',
          body: '{{companyName}}\n{{stationOcppId}}',
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.rendered).toBe('EVtivity\nCS-1234');
    });

    it('honors sampleContext overrides', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/station-message-templates/preview',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          state: 'charging',
          body: 'Charging {{energyKwh}} kWh',
          sampleContext: { energyKwh: '99.9' },
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().rendered).toBe('Charging 99.9 kWh');
    });
  });
});
