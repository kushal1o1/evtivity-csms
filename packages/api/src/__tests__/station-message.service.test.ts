// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi, beforeEach } from 'vitest';

// -- DB mock helpers --

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
    'innerJoin',
    'leftJoin',
    'groupBy',
    'values',
    'returning',
    'set',
    'onConflictDoUpdate',
    'delete',
    'insert',
    'update',
  ];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  let awaited = false;
  chain['then'] = (onFulfilled?: (v: unknown) => unknown, onRejected?: (r: unknown) => unknown) => {
    if (!awaited) {
      awaited = true;
      const result = dbResults[dbCallIndex] ?? [];
      dbCallIndex++;
      return Promise.resolve(result).then(onFulfilled, onRejected);
    }
    return Promise.resolve([]).then(onFulfilled, onRejected);
  };
  chain['catch'] = (onRejected?: (r: unknown) => unknown) => Promise.resolve([]).catch(onRejected);
  return chain;
}

// -- Hoisted mocks --

const {
  mockIsStationMessageEnabled,
  mockGetStationMessagePricingFormat,
  mockRenderStationMessage,
  mockResolveTariff,
  mockFormatPricingDisplay,
  mockPublish,
} = vi.hoisted(() => ({
  mockIsStationMessageEnabled: vi.fn(),
  mockGetStationMessagePricingFormat: vi.fn(),
  mockRenderStationMessage: vi.fn(),
  mockResolveTariff: vi.fn(),
  mockFormatPricingDisplay: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

// -- Mocks --

vi.mock('@evtivity/database', () => ({
  db: {
    select: vi.fn(() => makeChain()),
    insert: vi.fn(() => makeChain()),
    update: vi.fn(() => makeChain()),
    delete: vi.fn(() => makeChain()),
  },
  client: vi.fn().mockResolvedValue([
    { key: 'company.name', value: 'EVtivity' },
    { key: 'company.supportPhone', value: '+1-555-0100' },
  ]),
  chargingStations: {
    id: 'id',
    stationId: 'stationId',
    siteId: 'siteId',
    isOnline: 'isOnline',
    ocppProtocol: 'ocppProtocol',
  },
  evses: { id: 'id', stationId: 'stationId' },
  connectors: { evseId: 'evseId', status: 'status' },
  reservations: {
    stationId: 'stationId',
    status: 'status',
    expiresAt: 'expiresAt',
    driverId: 'driverId',
  },
  drivers: { id: 'id', firstName: 'firstName' },
  chargingSessions: {
    stationId: 'stationId',
    status: 'status',
    id: 'id',
    evseId: 'evseId',
    driverId: 'driverId',
    transactionId: 'transactionId',
    startedAt: 'startedAt',
    energyDeliveredWh: 'energyDeliveredWh',
    currentCostCents: 'currentCostCents',
    currency: 'currency',
    tariffIdleFeePricePerMinute: 'tariffIdleFeePricePerMinute',
  },
  meterValues: {
    sessionId: 'sessionId',
    measurand: 'measurand',
    value: 'value',
    unit: 'unit',
    timestamp: 'timestamp',
  },
  stationMessagePushes: {
    stationId: 'stationId',
    ocppMessageId: 'ocppMessageId',
    contentHash: 'contentHash',
    state: 'state',
    pushedAt: 'pushedAt',
  },
  isStationMessageEnabled: mockIsStationMessageEnabled,
  getStationMessagePricingFormat: mockGetStationMessagePricingFormat,
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gt: vi.fn(),
  inArray: vi.fn(),
  desc: vi.fn(),
}));

vi.mock('@evtivity/lib', () => ({
  formatPricingDisplay: mockFormatPricingDisplay,
  renderStationMessage: mockRenderStationMessage,
}));

vi.mock('../services/tariff.service.js', () => ({
  resolveTariff: mockResolveTariff,
}));

vi.mock('../lib/pubsub.js', () => ({
  getPubSub: vi.fn(() => ({ publish: mockPublish })),
}));

// -- Import under test (after mocks) --

import {
  pushAllStationMessages,
  pushStationMessageSlot,
  pushTransactionMessage,
  clearAllTransactionMessages,
  STATION_MESSAGE_SLOT_IDLE,
  STATION_MESSAGE_SLOT_CHARGING,
  STATION_MESSAGE_SLOT_SUSPENDED,
  STATION_MESSAGE_SLOT_DISCHARGING,
  STATION_MESSAGE_SLOT_FAULTED,
  STATION_MESSAGE_SLOT_UNAVAILABLE,
  type TransactionSessionRow,
} from '../services/station-message.service.js';

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
};

const STATION_OCPP_ID = 'CS-0001';
const INTERNAL_STATION_ID = 'sta_000000000001';

const STATION_ROW = {
  id: INTERNAL_STATION_ID,
  stationOcppId: STATION_OCPP_ID,
  siteId: 'sit_000000000001',
};

const TARIFF = {
  id: 'trf_1',
  name: 'Default',
  currency: 'USD',
  pricePerKwh: '0.30',
  pricePerMinute: '0.02',
  pricePerSession: null,
  idleFeePricePerMinute: null,
  reservationFeePerMinute: null,
  taxRate: null,
  restrictions: null,
  priority: 0,
  isDefault: true,
};

describe('station-message.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDbResults();
    mockIsStationMessageEnabled.mockResolvedValue(true);
    mockGetStationMessagePricingFormat.mockResolvedValue('compact');
    mockResolveTariff.mockResolvedValue(TARIFF);
    mockFormatPricingDisplay.mockReturnValue('$0.30/kWh + $0.02/min');
    mockRenderStationMessage.mockImplementation((state: string) =>
      Promise.resolve(`rendered:${state}`),
    );
    mockPublish.mockResolvedValue(undefined);
  });

  describe('pushAllStationMessages', () => {
    it('returns early when stationMessage.enabled is false', async () => {
      mockIsStationMessageEnabled.mockResolvedValueOnce(false);

      await pushAllStationMessages(
        STATION_OCPP_ID,
        INTERNAL_STATION_ID,
        'ocpp2.1',
        mockLogger as never,
      );

      expect(mockPublish).not.toHaveBeenCalled();
      expect(mockRenderStationMessage).not.toHaveBeenCalled();
    });

    it('skips OCPP 1.6 stations', async () => {
      await pushAllStationMessages(
        STATION_OCPP_ID,
        INTERNAL_STATION_ID,
        'ocpp1.6',
        mockLogger as never,
      );

      expect(mockPublish).not.toHaveBeenCalled();
      expect(mockRenderStationMessage).not.toHaveBeenCalled();
    });

    it('pushes 3 slots (idle/faulted/unavailable) when enabled with available connector', async () => {
      // DB calls in order:
      // 1) station lookup -> [STATION_ROW]
      // 2) connector status query (resolveIdleState) -> []
      // 3) idle slot existing push -> []
      // 4) idle slot insert -> []
      // 5) faulted slot existing push -> []
      // 6) faulted slot insert -> []
      // 7) unavailable slot existing push -> []
      // 8) unavailable slot insert -> []
      setupDbResults([STATION_ROW], [], [], [], [], [], [], []);

      await pushAllStationMessages(
        STATION_OCPP_ID,
        INTERNAL_STATION_ID,
        'ocpp2.1',
        mockLogger as never,
      );

      expect(mockRenderStationMessage).toHaveBeenCalledWith('available', expect.any(Object));
      expect(mockRenderStationMessage).toHaveBeenCalledWith('faulted', expect.any(Object));
      expect(mockRenderStationMessage).toHaveBeenCalledWith('unavailable', expect.any(Object));
      expect(mockPublish).toHaveBeenCalledTimes(3);

      const publishedSlots = mockPublish.mock.calls.map((call) => {
        const body = JSON.parse(call[1] as string) as {
          payload: { message: { id: number; state: string } };
        };
        return body.payload.message;
      });
      const slotIds = publishedSlots.map((s) => s.id);
      expect(slotIds).toContain(STATION_MESSAGE_SLOT_IDLE);
      expect(slotIds).toContain(STATION_MESSAGE_SLOT_FAULTED);
      expect(slotIds).toContain(STATION_MESSAGE_SLOT_UNAVAILABLE);
    });

    it('skips dispatch when contentHash matches existing push (no-op)', async () => {
      // Pre-compute the hash for "rendered:available", "rendered:faulted", "rendered:unavailable"
      const crypto = await import('node:crypto');
      const idleHash = crypto.createHash('sha256').update('rendered:available').digest('hex');
      const faultedHash = crypto.createHash('sha256').update('rendered:faulted').digest('hex');
      const unavailableHash = crypto
        .createHash('sha256')
        .update('rendered:unavailable')
        .digest('hex');

      setupDbResults(
        [STATION_ROW],
        [],
        [{ contentHash: idleHash }],
        [{ contentHash: faultedHash }],
        [{ contentHash: unavailableHash }],
      );

      await pushAllStationMessages(
        STATION_OCPP_ID,
        INTERNAL_STATION_ID,
        'ocpp2.1',
        mockLogger as never,
      );

      expect(mockPublish).not.toHaveBeenCalled();
    });

    it('uses reserved template when connector is reserved with active reservation', async () => {
      const reservationRow = {
        expiresAt: new Date('2026-05-06T15:45:00Z'),
        driverFirstName: 'Alex',
      };

      setupDbResults(
        [STATION_ROW],
        [{ status: 'reserved' }],
        [reservationRow],
        [],
        [],
        [],
        [],
        [],
        [],
      );

      await pushAllStationMessages(
        STATION_OCPP_ID,
        INTERNAL_STATION_ID,
        'ocpp2.1',
        mockLogger as never,
      );

      expect(mockRenderStationMessage).toHaveBeenCalledWith(
        'reserved',
        expect.objectContaining({
          driverFirstName: 'Alex',
          reservationExpiresAt: expect.any(String),
        }),
      );
    });

    it('uses occupied template when connector is occupied without active session', async () => {
      setupDbResults([STATION_ROW], [{ status: 'occupied' }], [], [], [], [], [], []);

      await pushAllStationMessages(
        STATION_OCPP_ID,
        INTERNAL_STATION_ID,
        'ocpp2.1',
        mockLogger as never,
      );

      expect(mockRenderStationMessage).toHaveBeenCalledWith('occupied', expect.any(Object));
    });
  });

  describe('pushStationMessageSlot', () => {
    it('publishes SetDisplayMessage for OCPP 2.1', async () => {
      await pushStationMessageSlot(STATION_OCPP_ID, 'ocpp2.1', 9000, 'Idle', 'Hello');

      expect(mockPublish).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockPublish.mock.calls[0]![1] as string) as {
        action: string;
        payload: { message: { id: number; state: string; message: { content: string } } };
      };
      expect(body.action).toBe('SetDisplayMessage');
      expect(body.payload.message.id).toBe(9000);
      expect(body.payload.message.state).toBe('Idle');
      expect(body.payload.message.message.content).toBe('Hello');
    });

    it('falls back to DataTransfer for OCPP 1.6 idle slot only', async () => {
      await pushStationMessageSlot(STATION_OCPP_ID, 'ocpp1.6', 9000, 'Idle', 'Pricing');

      expect(mockPublish).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockPublish.mock.calls[0]![1] as string) as { action: string };
      expect(body.action).toBe('DataTransfer');
    });

    it('skips OCPP 1.6 for non-idle slots', async () => {
      await pushStationMessageSlot(STATION_OCPP_ID, 'ocpp1.6', 9004, 'Faulted', 'Fault');

      expect(mockPublish).not.toHaveBeenCalled();
    });
  });

  describe('pushTransactionMessage', () => {
    function makeSession(overrides: Partial<TransactionSessionRow> = {}): TransactionSessionRow {
      return {
        id: 'ses_1',
        stationId: INTERNAL_STATION_ID,
        evseId: 'evs_1',
        driverId: 'drv_1',
        transactionId: 'tx-1',
        startedAt: new Date(Date.now() - 12 * 60_000),
        energyDeliveredWh: '12400',
        currentCostCents: 342,
        currency: 'USD',
        chargingState: null,
        tariffIdleFeePricePerMinute: '0.10',
        ...overrides,
      };
    }

    it('skips OCPP 1.6 stations', async () => {
      await pushTransactionMessage(
        INTERNAL_STATION_ID,
        STATION_OCPP_ID,
        'ocpp1.6',
        makeSession({ chargingState: 'Charging' }),
        mockLogger as never,
      );

      expect(mockPublish).not.toHaveBeenCalled();
    });

    it('skips when station messages are disabled', async () => {
      mockIsStationMessageEnabled.mockResolvedValueOnce(false);

      await pushTransactionMessage(
        INTERNAL_STATION_ID,
        STATION_OCPP_ID,
        'ocpp2.1',
        makeSession({ chargingState: 'Charging' }),
        mockLogger as never,
      );

      expect(mockPublish).not.toHaveBeenCalled();
    });

    it('dispatches charging template into slot 9001 when chargingState is Charging', async () => {
      // DB calls in order:
      // 1) existing transaction-slot pushes -> []
      // 2) latest power meter value -> [{ value: '7000', unit: 'W' }]
      // 3) driver lookup -> [{ firstName: 'Alex' }]
      // 4) station_message_pushes upsert (insert chain)
      setupDbResults([], [{ value: '7000', unit: 'W' }], [{ firstName: 'Alex' }], []);

      await pushTransactionMessage(
        INTERNAL_STATION_ID,
        STATION_OCPP_ID,
        'ocpp2.1',
        makeSession({ chargingState: 'Charging' }),
        mockLogger as never,
      );

      expect(mockRenderStationMessage).toHaveBeenCalledWith(
        'charging',
        expect.objectContaining({
          energyKwh: '12.4',
          powerKw: '7.0',
          driverFirstName: 'Alex',
        }),
      );
      expect(mockPublish).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockPublish.mock.calls[0]![1] as string) as {
        action: string;
        payload: { message: { id: number; state: string } };
      };
      expect(body.action).toBe('SetDisplayMessage');
      expect(body.payload.message.id).toBe(STATION_MESSAGE_SLOT_CHARGING);
      expect(body.payload.message.state).toBe('Charging');
    });

    it('dispatches suspended template (slot 9002) and clears 9003 on SuspendedEV', async () => {
      // existing pushes include slot 9003 (Discharging) -> must be cleared
      setupDbResults(
        [
          {
            ocppMessageId: STATION_MESSAGE_SLOT_DISCHARGING,
            contentHash: 'old-hash',
          },
        ],
        [],
        [],
        [],
      );

      await pushTransactionMessage(
        INTERNAL_STATION_ID,
        STATION_OCPP_ID,
        'ocpp2.1',
        makeSession({ chargingState: 'SuspendedEV' }),
        mockLogger as never,
      );

      expect(mockRenderStationMessage).toHaveBeenCalledWith(
        'suspended',
        expect.objectContaining({ idleFeeRate: expect.stringContaining('/min') }),
      );

      const actions = mockPublish.mock.calls.map((c) => {
        const body = JSON.parse(c[1] as string) as {
          action: string;
          payload: { message?: { id: number; state: string }; id?: number };
        };
        return body;
      });

      const setCall = actions.find((a) => a.action === 'SetDisplayMessage');
      expect(setCall?.payload.message?.id).toBe(STATION_MESSAGE_SLOT_SUSPENDED);
      expect(setCall?.payload.message?.state).toBe('Suspended');

      const clearCall = actions.find(
        (a) =>
          a.action === 'ClearDisplayMessage' && a.payload.id === STATION_MESSAGE_SLOT_DISCHARGING,
      );
      expect(clearCall).toBeDefined();
    });

    it('dispatches discharging template (slot 9003) and clears 9002 on Discharging', async () => {
      setupDbResults(
        [
          {
            ocppMessageId: STATION_MESSAGE_SLOT_SUSPENDED,
            contentHash: 'old-hash',
          },
        ],
        [],
        [],
        [],
      );

      await pushTransactionMessage(
        INTERNAL_STATION_ID,
        STATION_OCPP_ID,
        'ocpp2.1',
        makeSession({ chargingState: 'Discharging' }),
        mockLogger as never,
      );

      const actions = mockPublish.mock.calls.map((c) => {
        const body = JSON.parse(c[1] as string) as {
          action: string;
          payload: { message?: { id: number; state: string }; id?: number };
        };
        return body;
      });

      const setCall = actions.find((a) => a.action === 'SetDisplayMessage');
      expect(setCall?.payload.message?.id).toBe(STATION_MESSAGE_SLOT_DISCHARGING);
      expect(setCall?.payload.message?.state).toBe('Discharging');

      const clearCall = actions.find(
        (a) =>
          a.action === 'ClearDisplayMessage' && a.payload.id === STATION_MESSAGE_SLOT_SUSPENDED,
      );
      expect(clearCall).toBeDefined();
    });

    it('clears slot 9002 when transitioning Charging-from-Suspended', async () => {
      // Existing rows: 9001 (Charging) and 9002 (Suspended).
      // chargingState is now Charging -> we should refresh 9001 and clear 9002.
      setupDbResults(
        [
          { ocppMessageId: STATION_MESSAGE_SLOT_CHARGING, contentHash: 'old-charging' },
          { ocppMessageId: STATION_MESSAGE_SLOT_SUSPENDED, contentHash: 'old-suspended' },
        ],
        [],
        [],
        [],
      );

      await pushTransactionMessage(
        INTERNAL_STATION_ID,
        STATION_OCPP_ID,
        'ocpp2.1',
        makeSession({ chargingState: 'Charging' }),
        mockLogger as never,
      );

      const clearCall = mockPublish.mock.calls.find((c) => {
        const body = JSON.parse(c[1] as string) as { action: string; payload: { id?: number } };
        return (
          body.action === 'ClearDisplayMessage' &&
          body.payload.id === STATION_MESSAGE_SLOT_SUSPENDED
        );
      });
      expect(clearCall).toBeDefined();
    });

    it('clears 9001/9002/9003 on session ended', async () => {
      // existing pushes returned for clearAllTransactionMessages
      setupDbResults([
        { ocppMessageId: STATION_MESSAGE_SLOT_CHARGING },
        { ocppMessageId: STATION_MESSAGE_SLOT_SUSPENDED },
        { ocppMessageId: STATION_MESSAGE_SLOT_DISCHARGING },
      ]);

      await clearAllTransactionMessages(
        INTERNAL_STATION_ID,
        STATION_OCPP_ID,
        'ocpp2.1',
        mockLogger as never,
      );

      const cleared = mockPublish.mock.calls
        .map((c) => JSON.parse(c[1] as string) as { action: string; payload: { id?: number } })
        .filter((b) => b.action === 'ClearDisplayMessage')
        .map((b) => b.payload.id);

      expect(cleared).toEqual(
        expect.arrayContaining([
          STATION_MESSAGE_SLOT_CHARGING,
          STATION_MESSAGE_SLOT_SUSPENDED,
          STATION_MESSAGE_SLOT_DISCHARGING,
        ]),
      );
    });

    it('does not push when chargingState is Idle/EVConnected and no tracked slots', async () => {
      setupDbResults([]);

      await pushTransactionMessage(
        INTERNAL_STATION_ID,
        STATION_OCPP_ID,
        'ocpp2.1',
        makeSession({ chargingState: 'Idle' }),
        mockLogger as never,
      );

      expect(mockPublish).not.toHaveBeenCalled();
    });
  });
});
