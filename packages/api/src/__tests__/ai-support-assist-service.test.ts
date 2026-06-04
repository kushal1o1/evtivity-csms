// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

const TABLES = vi.hoisted(() => ({
  chatbotAiConfigs: { __table: 'chatbotAiConfigs', userId: 'user_id' },
  settings: { __table: 'settings', key: 'key', value: 'value' },
  users: { __table: 'users', id: 'id', language: 'language' },
}));
const dbResultsByTable = vi.hoisted((): { map: Record<string, unknown[]> } => ({ map: {} }));
function setDbResults(opts: {
  chatbotAiConfigs?: unknown[];
  settings?: unknown[];
  users?: unknown[];
}) {
  dbResultsByTable.map = {
    chatbotAiConfigs: opts.chatbotAiConfigs ?? [],
    settings: opts.settings ?? [],
    users: opts.users ?? [],
  };
}
const makeChain = vi.hoisted(() => () => {
  const chain: Record<string, unknown> = {};
  let table = '';
  chain['select'] = vi.fn(() => chain);
  chain['from'] = vi.fn((t: { __table?: string }) => {
    table = t.__table ?? '';
    return chain;
  });
  for (const m of ['where', 'limit']) {
    chain[m] = vi.fn(() => chain);
  }
  chain['then'] = (resolve?: (v: unknown) => unknown, reject?: (r: unknown) => unknown) => {
    const r = dbResultsByTable.map[table] ?? [];
    return Promise.resolve(r).then(resolve, reject);
  };
  return chain;
});

vi.mock('@evtivity/database', () => ({
  db: { select: vi.fn(() => makeChain()) },
  chatbotAiConfigs: TABLES.chatbotAiConfigs,
  settings: TABLES.settings,
  users: TABLES.users,
}));

vi.mock('drizzle-orm', () => ({ eq: vi.fn(), like: vi.fn() }));

const decryptString = vi.hoisted(() => vi.fn((v: string) => `decrypted:${v}`));
vi.mock('@evtivity/lib', () => ({ decryptString }));

const mockConfig = vi.hoisted(() => ({ SETTINGS_ENCRYPTION_KEY: 'enc-key' }));
vi.mock('../lib/config.js', () => ({ config: mockConfig }));

const createAiProvider = vi.hoisted(() => vi.fn());
vi.mock('../services/ai/provider-factory.js', () => ({ createAiProvider }));

const executeToolLoop = vi.hoisted(() => vi.fn());
vi.mock('../services/ai/tool-executor.js', () => ({ executeToolLoop }));

const selectTools = vi.hoisted(() => vi.fn());
vi.mock('../services/ai/assistant.service.js', () => ({ selectTools }));

import {
  handleSupportAiAssist,
  resolveSupportAiConfig,
} from '../services/ai/support-assist.service.js';

function makeApp(): FastifyInstance {
  return { inject: vi.fn() } as unknown as FastifyInstance;
}

beforeEach(() => {
  setDbResults({});
  createAiProvider.mockReset();
  executeToolLoop.mockReset();
  selectTools.mockReset();
  decryptString.mockClear();
  mockConfig.SETTINGS_ENCRYPTION_KEY = 'enc-key';
});

describe('resolveSupportAiConfig', () => {
  it('uses the per-user support config and decrypts the key', async () => {
    setDbResults({
      chatbotAiConfigs: [
        {
          supportAiProvider: 'anthropic',
          supportAiApiKeyEnc: 'enc-secret',
          supportAiModel: 'claude-x',
          supportAiTemperature: '0.6',
          supportAiTopP: '0.9',
          supportAiTopK: 20,
          supportAiSystemPrompt: 'custom',
          supportAiTone: 'friendly',
        },
      ],
    });
    const cfg = await resolveSupportAiConfig('usr');
    expect(decryptString).toHaveBeenCalledWith('enc-secret', 'enc-key');
    expect(cfg).toEqual({
      provider: 'anthropic',
      apiKey: 'decrypted:enc-secret',
      model: 'claude-x',
      temperature: 0.6,
      topP: 0.9,
      topK: 20,
      systemPrompt: 'custom',
      tone: 'friendly',
    });
  });

  it('coerces null per-user optional fields to undefined', async () => {
    setDbResults({
      chatbotAiConfigs: [
        {
          supportAiProvider: 'openai',
          supportAiApiKeyEnc: 'enc',
          supportAiModel: null,
          supportAiTemperature: null,
          supportAiTopP: null,
          supportAiTopK: null,
          supportAiSystemPrompt: null,
          supportAiTone: null,
        },
      ],
    });
    const cfg = await resolveSupportAiConfig('usr');
    expect(cfg).toEqual({
      provider: 'openai',
      apiKey: 'decrypted:enc',
      model: undefined,
      temperature: undefined,
      topP: undefined,
      topK: undefined,
      systemPrompt: undefined,
      tone: undefined,
    });
  });

  it('throws when encryption key missing for a per-user config', async () => {
    mockConfig.SETTINGS_ENCRYPTION_KEY = '';
    setDbResults({
      chatbotAiConfigs: [{ supportAiProvider: 'anthropic', supportAiApiKeyEnc: 'enc' }],
    });
    await expect(resolveSupportAiConfig('usr')).rejects.toThrow('SETTINGS_ENCRYPTION_KEY');
  });

  it('falls back to system settings when the per-user row lacks support fields', async () => {
    setDbResults({
      chatbotAiConfigs: [{ supportAiProvider: '', supportAiApiKeyEnc: '' }],
      settings: [
        { key: 'supportAi.enabled', value: true },
        { key: 'supportAi.provider', value: 'gemini' },
        { key: 'supportAi.apiKeyEnc', value: 'sys-enc' },
        { key: 'supportAi.model', value: 'gemini-pro' },
        { key: 'supportAi.temperature', value: '0' },
        { key: 'supportAi.topP', value: '' },
        { key: 'supportAi.topK', value: '' },
        { key: 'supportAi.systemPrompt', value: '' },
        { key: 'supportAi.tone', value: '' },
      ],
    });
    const cfg = await resolveSupportAiConfig('usr');
    expect(cfg.provider).toBe('gemini');
    expect(cfg.apiKey).toBe('decrypted:sys-enc');
    expect(cfg.model).toBe('gemini-pro');
    expect(cfg.temperature).toBe(0);
    expect(cfg.topP).toBeUndefined();
    expect(cfg.topK).toBeUndefined();
    expect(cfg.systemPrompt).toBeUndefined();
    // empty tone falls back to professional
    expect(cfg.tone).toBe('professional');
  });

  it('parses non-empty system topP/topK/systemPrompt and tone', async () => {
    setDbResults({
      settings: [
        { key: 'supportAi.enabled', value: true },
        { key: 'supportAi.provider', value: 'anthropic' },
        { key: 'supportAi.apiKeyEnc', value: 'sys-enc' },
        { key: 'supportAi.temperature', value: '0.3' },
        { key: 'supportAi.topP', value: '0.85' },
        { key: 'supportAi.topK', value: '15' },
        { key: 'supportAi.systemPrompt', value: 'sys support prompt' },
        { key: 'supportAi.tone', value: 'formal' },
      ],
    });
    const cfg = await resolveSupportAiConfig('usr');
    expect(cfg.temperature).toBe(0.3);
    expect(cfg.topP).toBe(0.85);
    expect(cfg.topK).toBe(15);
    expect(cfg.systemPrompt).toBe('sys support prompt');
    expect(cfg.tone).toBe('formal');
  });

  it('throws SUPPORT_AI_NOT_CONFIGURED when system support AI disabled', async () => {
    setDbResults({ settings: [{ key: 'supportAi.enabled', value: false }] });
    await expect(resolveSupportAiConfig('usr')).rejects.toMatchObject({
      code: 'SUPPORT_AI_NOT_CONFIGURED',
    });
  });

  it('throws SUPPORT_AI_NOT_CONFIGURED when provider or key missing in system config', async () => {
    setDbResults({
      settings: [
        { key: 'supportAi.enabled', value: true },
        { key: 'supportAi.provider', value: 'openai' },
      ],
    });
    await expect(resolveSupportAiConfig('usr')).rejects.toMatchObject({
      code: 'SUPPORT_AI_NOT_CONFIGURED',
    });
  });

  it('throws when encryption key missing for a system config', async () => {
    mockConfig.SETTINGS_ENCRYPTION_KEY = '';
    setDbResults({
      settings: [
        { key: 'supportAi.enabled', value: true },
        { key: 'supportAi.provider', value: 'openai' },
        { key: 'supportAi.apiKeyEnc', value: 'sys-enc' },
      ],
    });
    await expect(resolveSupportAiConfig('usr')).rejects.toThrow('SETTINGS_ENCRYPTION_KEY');
  });
});

describe('handleSupportAiAssist', () => {
  it('selects GET-only tools, builds a customer-reply prompt, and returns the draft', async () => {
    setDbResults({
      chatbotAiConfigs: [
        {
          supportAiProvider: 'anthropic',
          supportAiApiKeyEnc: 'enc',
          supportAiModel: 'claude-x',
          supportAiTemperature: '0.5',
          supportAiTopP: null,
          supportAiTopK: null,
          supportAiSystemPrompt: null,
          supportAiTone: 'friendly',
        },
      ],
      users: [{ language: 'en' }],
    });
    createAiProvider.mockReturnValue({ chat: vi.fn() });
    selectTools.mockResolvedValue([
      {
        name: 'get_support_case',
        description: '',
        method: 'GET',
        pathTemplate: '/x',
        parameters: {},
      },
    ]);
    executeToolLoop.mockResolvedValue({ content: 'Draft reply', apiCallsMade: 4 });

    const result = await handleSupportAiAssist(makeApp(), 'usr', 'cas_1', false, 'Bearer t');

    expect(result).toEqual({ draft: 'Draft reply', apiCallsMade: 4 });
    expect(createAiProvider).toHaveBeenCalledWith('anthropic', 'decrypted:enc', 'claude-x');

    // selectTools called with fallback Support Cases tag and GET filter
    const selectArgs = selectTools.mock.calls[0]!;
    expect(selectArgs[3].fallbackTags).toEqual(['Support Cases']);
    const filter = selectArgs[3].filter as (t: { method: string }) => boolean;
    expect(filter({ method: 'GET' })).toBe(true);
    expect(filter({ method: 'POST' })).toBe(false);
    // user message mentions the case id and customer reply
    const userMessage = selectArgs[1] as string;
    expect(userMessage).toContain('cas_1');
    expect(userMessage).toContain('customer-facing reply');

    // executeToolLoop receives the system prompt with tone + reply type and max 15 iterations
    const [, , messages, tools, systemPrompt, chatOptions, authHeader, maxIter] =
      executeToolLoop.mock.calls[0]!;
    expect(messages).toEqual([{ role: 'user', content: userMessage }]);
    expect(tools).toHaveLength(1);
    expect(systemPrompt).toContain('Tone: friendly');
    expect(systemPrompt).toContain('Generate: a customer-facing reply');
    expect(chatOptions).toEqual({ temperature: 0.5, topP: undefined, topK: undefined });
    expect(authHeader).toBe('Bearer t');
    expect(maxIter).toBe(15);
  });

  it('builds an internal-note prompt when isInternalNote is true and uses the default professional tone', async () => {
    setDbResults({
      settings: [
        { key: 'supportAi.enabled', value: true },
        { key: 'supportAi.provider', value: 'openai' },
        { key: 'supportAi.apiKeyEnc', value: 'sys-enc' },
      ],
      users: [{ language: 'es' }],
    });
    createAiProvider.mockReturnValue({ chat: vi.fn() });
    selectTools.mockResolvedValue([]);
    executeToolLoop.mockResolvedValue({ content: 'Internal note', apiCallsMade: 1 });

    const result = await handleSupportAiAssist(makeApp(), 'usr', 'cas_2', true, 'Bearer t');

    expect(result.draft).toBe('Internal note');
    const userMessage = selectTools.mock.calls[0]![1] as string;
    expect(userMessage).toContain('an internal note for the support team');
    const systemPrompt = executeToolLoop.mock.calls[0]![4] as string;
    // Spanish default support prompt
    expect(systemPrompt).toContain('agente de soporte');
    expect(systemPrompt).toContain('Tone: professional');
    expect(systemPrompt).toContain('Generate: an internal note for the support team');
  });

  it('defaults to the en prompt when the user language is unknown / no user row', async () => {
    setDbResults({
      chatbotAiConfigs: [{ supportAiProvider: 'gemini', supportAiApiKeyEnc: 'enc' }],
    });
    createAiProvider.mockReturnValue({ chat: vi.fn() });
    selectTools.mockResolvedValue([]);
    executeToolLoop.mockResolvedValue({ content: 'd', apiCallsMade: 0 });

    await handleSupportAiAssist(makeApp(), 'usr', 'cas_3', false, 'Bearer t');
    const systemPrompt = executeToolLoop.mock.calls[0]![4] as string;
    expect(systemPrompt).toContain('support agent for an EV charging station');
  });
});
