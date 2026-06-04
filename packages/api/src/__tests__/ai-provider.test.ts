// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import { createAiProvider } from '../services/ai/provider-factory.js';
import { buildToolRequest, getToolsForCategories } from '../services/ai/tools.js';
import { AnthropicProvider } from '../services/ai/anthropic-provider.js';
import { OpenAiProvider } from '../services/ai/openai-provider.js';
import { GeminiProvider } from '../services/ai/gemini-provider.js';

describe('createAiProvider', () => {
  it('returns AnthropicProvider for anthropic', () => {
    const provider = createAiProvider('anthropic', 'test-key');
    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  it('returns OpenAiProvider for openai', () => {
    const provider = createAiProvider('openai', 'test-key');
    expect(provider).toBeInstanceOf(OpenAiProvider);
  });

  it('returns GeminiProvider for gemini', () => {
    const provider = createAiProvider('gemini', 'test-key');
    expect(provider).toBeInstanceOf(GeminiProvider);
  });

  it('throws for unknown provider', () => {
    expect(() => createAiProvider('invalid', 'test-key')).toThrow('Unknown AI provider: invalid');
  });
});

describe('buildToolRequest', () => {
  it('returns correct method and url for list_dashboard_stats', () => {
    const result = buildToolRequest('list_dashboard_stats', {});
    expect(result.method).toBe('GET');
    expect(result.url).toBe('/v1/dashboard/stats');
    expect(result.query).toEqual({});
  });

  it('interpolates path params for get_station', () => {
    const result = buildToolRequest('get_station', { id: 'STATION-001' });
    expect(result.method).toBe('GET');
    expect(result.url).toBe('/v1/stations/STATION-001');
    expect(result.query).toEqual({});
  });

  it('separates query params for list_stations', () => {
    const result = buildToolRequest('list_stations', { page: 2, limit: 10 });
    expect(result.method).toBe('GET');
    expect(result.url).toBe('/v1/stations');
    expect(result.query).toEqual({ page: '2', limit: '10' });
  });

  it('handles mixed path and query params for get_session', () => {
    const result = buildToolRequest('get_session', { id: 'sess-123' });
    expect(result.method).toBe('GET');
    expect(result.url).toBe('/v1/sessions/sess-123');
    expect(result.query).toEqual({});
  });

  it('ignores undefined and null values in query params', () => {
    const result = buildToolRequest('list_stations', {
      page: 1,
      limit: undefined,
      search: null,
    });
    expect(result.query).toEqual({ page: '1' });
  });

  it('throws for unknown tool name', () => {
    expect(() => buildToolRequest('nonexistent_tool', {})).toThrow(
      'Unknown tool: nonexistent_tool',
    );
  });

  it('encodes special characters in path params', () => {
    const result = buildToolRequest('get_station', { id: 'STATION/001' });
    expect(result.url).toBe('/v1/stations/STATION%2F001');
  });

  it('separates body params from path params for a POST tool', () => {
    const result = buildToolRequest('create_access_log', {
      action: 'login',
      metadata: { ip: '1.2.3.4' },
    });
    expect(result.method).toBe('POST');
    expect(result.url).toBe('/v1/access-logs');
    expect(result.query).toEqual({});
    expect(result.body).toEqual({ action: 'login', metadata: { ip: '1.2.3.4' } });
  });

  it('interpolates the path param and routes remaining fields to the body for a PATCH tool', () => {
    const result = buildToolRequest('update_api_key', { id: 7, permissions: ['stations:read'] });
    expect(result.method).toBe('PATCH');
    expect(result.url).toBe('/v1/api-keys/7');
    expect(result.query).toEqual({});
    expect(result.body).toEqual({ permissions: ['stations:read'] });
  });

  it('omits the body for a non-GET tool when only path params are provided', () => {
    const result = buildToolRequest('update_api_key', { id: 7 });
    expect(result.method).toBe('PATCH');
    expect(result.url).toBe('/v1/api-keys/7');
    expect(result).not.toHaveProperty('body');
  });

  it('JSON-encodes object values in path params', () => {
    const result = buildToolRequest('get_station', { id: { nested: true } });
    expect(result.url).toBe(`/v1/stations/${encodeURIComponent(JSON.stringify({ nested: true }))}`);
  });

  it('JSON-encodes object values in query params', () => {
    const result = buildToolRequest('list_stations', { filter: { status: 'online' } });
    expect(result.query).toEqual({ filter: JSON.stringify({ status: 'online' }) });
  });
});

describe('getToolsForCategories', () => {
  it('returns the tools for a known category', () => {
    const tools = getToolsForCategories(['Access Logs']);
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.map((t) => t.name)).toContain('list_access_logs');
    expect(tools.every((t) => typeof t.method === 'string')).toBe(true);
  });

  it('merges tools across multiple categories', () => {
    const tools = getToolsForCategories(['Access Logs', 'Audit']);
    const names = tools.map((t) => t.name);
    expect(names).toContain('list_access_logs');
    expect(names).toContain('list_audit');
  });

  it('skips unknown categories and returns an empty array when none match', () => {
    expect(getToolsForCategories(['NotARealCategory'])).toEqual([]);
  });

  it('ignores unknown categories while keeping known ones', () => {
    const tools = getToolsForCategories(['NotARealCategory', 'Audit']);
    expect(tools.map((t) => t.name)).toContain('list_audit');
  });

  it('returns an empty array for an empty tag list', () => {
    expect(getToolsForCategories([])).toEqual([]);
  });
});
