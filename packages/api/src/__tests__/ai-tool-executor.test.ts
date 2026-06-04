// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { executeToolLoop } from '../services/ai/tool-executor.js';
import type { AiProvider, AiResponse, ChatMessage } from '../services/ai/types.js';
import type { ExtendedToolDefinition } from '../services/ai/tools.js';

const listStationsTool: ExtendedToolDefinition = {
  name: 'list_stations',
  description: 'List stations',
  method: 'GET',
  pathTemplate: '/v1/stations',
  parameters: { type: 'object', properties: {} },
};

const createAccessLogTool: ExtendedToolDefinition = {
  name: 'create_access_log',
  description: 'Create access log',
  method: 'POST',
  pathTemplate: '/v1/access-logs',
  parameters: { type: 'object', properties: {} },
};

function makeProvider(...responses: AiResponse[]): AiProvider & { chat: ReturnType<typeof vi.fn> } {
  const chat = vi.fn();
  for (const r of responses) chat.mockResolvedValueOnce(r);
  return { chat };
}

function makeApp(inject: ReturnType<typeof vi.fn>): FastifyInstance {
  return { inject } as unknown as FastifyInstance;
}

describe('executeToolLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the text response immediately when no tool call is requested', async () => {
    const provider = makeProvider({ content: 'Hello there', toolCalls: [], finishReason: 'end' });
    const inject = vi.fn();
    const result = await executeToolLoop(
      makeApp(inject),
      provider,
      [{ role: 'user', content: 'hi' }],
      [listStationsTool],
      'sys',
      { temperature: 0 },
      'Bearer token',
    );
    expect(result).toEqual({ content: 'Hello there', apiCallsMade: 0 });
    expect(inject).not.toHaveBeenCalled();
    expect(provider.chat).toHaveBeenCalledTimes(1);
  });

  it('executes a GET tool via inject with the auth header and feeds the result back', async () => {
    const provider = makeProvider(
      {
        content: 'looking up',
        toolCalls: [{ id: 'tc1', name: 'list_stations', arguments: { page: 1 } }],
        finishReason: 'tool_use',
      },
      { content: 'There are 2 stations', toolCalls: [], finishReason: 'end' },
    );
    const inject = vi.fn().mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({ data: [{ id: 'a' }, { id: 'b' }], total: 2 }),
    });
    const messages: ChatMessage[] = [{ role: 'user', content: 'how many stations' }];

    const result = await executeToolLoop(
      makeApp(inject),
      provider,
      messages,
      [listStationsTool],
      'sys',
      { temperature: 0.2 },
      'Bearer abc',
    );

    expect(result).toEqual({ content: 'There are 2 stations', apiCallsMade: 1 });
    expect(inject).toHaveBeenCalledWith({
      method: 'GET',
      url: '/v1/stations',
      query: { page: '1' },
      headers: { authorization: 'Bearer abc' },
    });

    // assistant tool-call message and tool_result fed back
    const assistantMsg = messages.find((m) => m.role === 'assistant');
    expect(assistantMsg).toMatchObject({
      role: 'assistant',
      content: 'looking up',
      toolCalls: [{ id: 'tc1', name: 'list_stations', arguments: { page: 1 } }],
    });
    const toolResultMsg = messages.find((m) => m.role === 'tool_result');
    expect(toolResultMsg).toMatchObject({
      role: 'tool_result',
      content: JSON.stringify({ data: [{ id: 'a' }, { id: 'b' }], total: 2 }),
      toolCallId: 'tc1',
      toolName: 'list_stations',
    });
    expect(provider.chat).toHaveBeenCalledTimes(2);
    // second chat call gets the augmented messages
    expect(provider.chat.mock.calls[1]![0]).toBe(messages);
  });

  it('includes a body payload for POST tools', async () => {
    const provider = makeProvider(
      {
        content: null,
        toolCalls: [{ id: 'tc1', name: 'create_access_log', arguments: { action: 'login' } }],
        finishReason: 'tool_use',
      },
      { content: 'logged', toolCalls: [], finishReason: 'end' },
    );
    const inject = vi.fn().mockResolvedValue({ statusCode: 201, body: JSON.stringify({ id: 1 }) });

    await executeToolLoop(
      makeApp(inject),
      provider,
      [{ role: 'user', content: 'log it' }],
      [createAccessLogTool],
      'sys',
      {},
      'Bearer t',
    );

    expect(inject).toHaveBeenCalledWith({
      method: 'POST',
      url: '/v1/access-logs',
      query: {},
      headers: { authorization: 'Bearer t' },
      payload: { action: 'login' },
    });
    // assistant content defaults to '' when provider returns null content
    // (no assertion needed beyond the loop completing)
  });

  it('rejects tool calls outside the allowed set without counting them', async () => {
    const provider = makeProvider(
      {
        content: 'sneaky',
        toolCalls: [{ id: 'tc1', name: 'delete_station', arguments: { id: 'x' } }],
        finishReason: 'tool_use',
      },
      { content: 'done', toolCalls: [], finishReason: 'end' },
    );
    const inject = vi.fn();

    const messages: ChatMessage[] = [{ role: 'user', content: 'delete it' }];
    const result = await executeToolLoop(
      makeApp(inject),
      provider,
      messages,
      [listStationsTool],
      'sys',
      {},
      'Bearer t',
    );

    expect(inject).not.toHaveBeenCalled();
    expect(result.apiCallsMade).toBe(0);
    const toolResultMsg = messages.find((m) => m.role === 'tool_result');
    expect(toolResultMsg).toMatchObject({
      content: JSON.stringify({ error: 'Tool not available: delete_station' }),
      toolCallId: 'tc1',
      toolName: 'delete_station',
    });
  });

  it('reports unparseable inject bodies as an error object but still counts the call', async () => {
    const provider = makeProvider(
      {
        content: null,
        toolCalls: [{ id: 'tc1', name: 'list_stations', arguments: {} }],
        finishReason: 'tool_use',
      },
      { content: 'recovered', toolCalls: [], finishReason: 'end' },
    );
    const inject = vi.fn().mockResolvedValue({ statusCode: 500, body: 'not json' });
    const messages: ChatMessage[] = [{ role: 'user', content: 'go' }];

    const result = await executeToolLoop(
      makeApp(inject),
      provider,
      messages,
      [listStationsTool],
      'sys',
      {},
      'Bearer t',
    );

    expect(result.apiCallsMade).toBe(1);
    const toolResultMsg = messages.find((m) => m.role === 'tool_result');
    expect(toolResultMsg?.content).toBe(
      JSON.stringify({ error: 'Failed to parse response', statusCode: 500 }),
    );
  });

  it('captures inject exceptions as an error result without counting them', async () => {
    const provider = makeProvider(
      {
        content: null,
        toolCalls: [{ id: 'tc1', name: 'list_stations', arguments: {} }],
        finishReason: 'tool_use',
      },
      { content: 'fallback', toolCalls: [], finishReason: 'end' },
    );
    const inject = vi.fn().mockRejectedValue(new Error('inject blew up'));
    const messages: ChatMessage[] = [{ role: 'user', content: 'go' }];

    const result = await executeToolLoop(
      makeApp(inject),
      provider,
      messages,
      [listStationsTool],
      'sys',
      {},
      'Bearer t',
    );

    expect(result.apiCallsMade).toBe(0);
    const toolResultMsg = messages.find((m) => m.role === 'tool_result');
    expect(toolResultMsg?.content).toContain('inject blew up');
  });

  it('captures buildToolRequest failures (unknown tool that is allowed) as an error result', async () => {
    // The tool is in the allowed set but absent from the global ALL_TOOLS
    // catalog, so buildToolRequest throws inside the try block.
    const ghostTool: ExtendedToolDefinition = {
      name: 'ghost_tool_does_not_exist',
      description: 'ghost',
      method: 'GET',
      pathTemplate: '/v1/ghost',
      parameters: { type: 'object', properties: {} },
    };
    const provider = makeProvider(
      {
        content: null,
        toolCalls: [{ id: 'tc1', name: 'ghost_tool_does_not_exist', arguments: {} }],
        finishReason: 'tool_use',
      },
      { content: 'fallback', toolCalls: [], finishReason: 'end' },
    );
    const inject = vi.fn();
    const messages: ChatMessage[] = [{ role: 'user', content: 'go' }];

    const result = await executeToolLoop(
      makeApp(inject),
      provider,
      messages,
      [ghostTool],
      'sys',
      {},
      'Bearer t',
    );

    expect(inject).not.toHaveBeenCalled();
    expect(result.apiCallsMade).toBe(0);
    const toolResultMsg = messages.find((m) => m.role === 'tool_result');
    expect(toolResultMsg?.content).toContain('Unknown tool: ghost_tool_does_not_exist');
  });

  it('stops at the iteration limit and returns the last content', async () => {
    const toolUse: AiResponse = {
      content: 'still working',
      toolCalls: [{ id: 'tc', name: 'list_stations', arguments: {} }],
      finishReason: 'tool_use',
    };
    const provider = makeProvider(toolUse, toolUse, toolUse);
    const inject = vi.fn().mockResolvedValue({ statusCode: 200, body: '{}' });

    const result = await executeToolLoop(
      makeApp(inject),
      provider,
      [{ role: 'user', content: 'loop' }],
      [listStationsTool],
      'sys',
      {},
      'Bearer t',
      2,
    );

    // limit of 2 means we stop after apiCallsMade reaches 2
    expect(result.apiCallsMade).toBe(2);
    expect(result.content).toBe('still working');
    expect(provider.chat).toHaveBeenCalledTimes(3);
  });

  it('returns a fallback message when the final response content is null', async () => {
    const provider = makeProvider({ content: null, toolCalls: [], finishReason: 'end' });
    const inject = vi.fn();
    const result = await executeToolLoop(
      makeApp(inject),
      provider,
      [{ role: 'user', content: 'hi' }],
      [listStationsTool],
      'sys',
      {},
      'Bearer t',
    );
    expect(result.content).toBe('I was unable to generate a response.');
  });

  it('defaults the iteration limit to 10 when not supplied', async () => {
    const toolUse: AiResponse = {
      content: 'work',
      toolCalls: [{ id: 'tc', name: 'list_stations', arguments: {} }],
      finishReason: 'tool_use',
    };
    // 11 tool_use responses; loop should cap at 10 api calls
    const provider = makeProvider(...Array.from({ length: 11 }, () => toolUse));
    const inject = vi.fn().mockResolvedValue({ statusCode: 200, body: '{}' });

    const result = await executeToolLoop(
      makeApp(inject),
      provider,
      [{ role: 'user', content: 'loop' }],
      [listStationsTool],
      'sys',
      {},
      'Bearer t',
    );

    expect(result.apiCallsMade).toBe(10);
  });
});
