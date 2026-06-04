// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatMessage, ToolDefinition } from '../services/ai/types.js';

// --- Anthropic SDK mock ---
const anthropicCreate = vi.hoisted(() => vi.fn());
const anthropicCtor = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: anthropicCreate };
    constructor(opts: unknown) {
      anthropicCtor(opts);
    }
  },
}));

// --- OpenAI SDK mock ---
const openaiCreate = vi.hoisted(() => vi.fn());
const openaiCtor = vi.hoisted(() => vi.fn());
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: openaiCreate } };
    constructor(opts: unknown) {
      openaiCtor(opts);
    }
  },
}));

// --- Gemini SDK mock ---
const geminiGenerateContent = vi.hoisted(() => vi.fn());
const geminiGetModel = vi.hoisted(() => vi.fn());
const geminiCtor = vi.hoisted(() => vi.fn());
vi.mock('@google/generative-ai', () => ({
  FunctionCallingMode: { AUTO: 'AUTO' },
  GoogleGenerativeAI: class {
    constructor(apiKey: string) {
      geminiCtor(apiKey);
    }
    getGenerativeModel(opts: unknown) {
      geminiGetModel(opts);
      return { generateContent: geminiGenerateContent };
    }
  },
}));

import { AnthropicProvider } from '../services/ai/anthropic-provider.js';
import { OpenAiProvider } from '../services/ai/openai-provider.js';
import { GeminiProvider } from '../services/ai/gemini-provider.js';

const SAMPLE_TOOLS: ToolDefinition[] = [
  {
    name: 'list_stations',
    description: 'List stations',
    parameters: { type: 'object', properties: { page: { type: 'integer' } } },
  },
];

describe('AnthropicProvider', () => {
  beforeEach(() => {
    anthropicCreate.mockReset();
    anthropicCtor.mockReset();
  });

  it('builds the SDK client with the provided apiKey', () => {
    new AnthropicProvider('secret-key', 'claude-x');
    expect(anthropicCtor).toHaveBeenCalledWith({ apiKey: 'secret-key' });
  });

  it('uses the default model when none provided and maps messages/tools/options', async () => {
    anthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'hello' }],
      stop_reason: 'end_turn',
    });
    const provider = new AnthropicProvider('k');
    const messages: ChatMessage[] = [
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: 'thinking',
        toolCalls: [{ id: 'tc1', name: 'list_stations', arguments: { page: 1 } }],
      },
      { role: 'tool_result', content: '{"data":[]}', toolCallId: 'tc1' },
    ];

    const res = await provider.chat(messages, SAMPLE_TOOLS, 'sys prompt', {
      temperature: 0.5,
      topP: 0.9,
      topK: 40,
    });

    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    const params = anthropicCreate.mock.calls[0]![0];
    expect(params.model).toBe('claude-sonnet-4-20250514');
    expect(params.max_tokens).toBe(4096);
    expect(params.system).toBe('sys prompt');
    expect(params.temperature).toBe(0.5);
    expect(params.top_p).toBe(0.9);
    expect(params.top_k).toBe(40);
    expect(params.tools).toEqual([
      {
        name: 'list_stations',
        description: 'List stations',
        input_schema: SAMPLE_TOOLS[0]!.parameters,
      },
    ]);
    // user message
    expect(params.messages[0]).toEqual({ role: 'user', content: 'hi' });
    // assistant message with text + tool_use blocks
    expect(params.messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'thinking' },
        { type: 'tool_use', id: 'tc1', name: 'list_stations', input: { page: 1 } },
      ],
    });
    // tool_result mapped to a user message
    expect(params.messages[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tc1', content: '{"data":[]}' }],
    });

    expect(res).toEqual({ content: 'hello', toolCalls: [], finishReason: 'end' });
  });

  it('maps plain assistant message (no tool calls) and omits tools when empty', async () => {
    anthropicCreate.mockResolvedValue({ content: [], stop_reason: 'end_turn' });
    const provider = new AnthropicProvider('k', 'm');
    const messages: ChatMessage[] = [
      { role: 'assistant', content: 'plain reply' },
      { role: 'tool_result', content: '{}' },
    ];

    await provider.chat(messages, [], 'sys');
    const params = anthropicCreate.mock.calls[0]![0];
    expect(params.tools).toBeUndefined();
    expect(params.temperature).toBeUndefined();
    expect(params.top_p).toBeUndefined();
    expect(params.top_k).toBeUndefined();
    expect(params.messages[0]).toEqual({ role: 'assistant', content: 'plain reply' });
    // tool_result with no toolCallId falls back to empty string id
    expect(params.messages[1]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: '', content: '{}' }],
    });
  });

  it('maps tool_use response and concatenates multiple text blocks', async () => {
    anthropicCreate.mockResolvedValue({
      content: [
        { type: 'text', text: 'part1 ' },
        { type: 'text', text: 'part2' },
        { type: 'tool_use', id: 'abc', name: 'list_stations', input: { page: 2 } },
      ],
      stop_reason: 'tool_use',
    });
    const provider = new AnthropicProvider('k');
    const res = await provider.chat([{ role: 'user', content: 'go' }], SAMPLE_TOOLS, 'sys');
    expect(res).toEqual({
      content: 'part1 part2',
      toolCalls: [{ id: 'abc', name: 'list_stations', arguments: { page: 2 } }],
      finishReason: 'tool_use',
    });
  });

  it('propagates SDK errors', async () => {
    anthropicCreate.mockRejectedValue(new Error('rate limit'));
    const provider = new AnthropicProvider('k');
    await expect(provider.chat([{ role: 'user', content: 'x' }], [], 'sys')).rejects.toThrow(
      'rate limit',
    );
  });

  it('emits an assistant tool_use block with no leading text when content is empty', async () => {
    anthropicCreate.mockResolvedValue({ content: [], stop_reason: 'end_turn' });
    const provider = new AnthropicProvider('k');
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 't', name: 'list_stations', arguments: {} }],
      },
    ];
    await provider.chat(messages, [], 'sys');
    const params = anthropicCreate.mock.calls[0]![0];
    expect(params.messages[0]).toEqual({
      role: 'assistant',
      content: [{ type: 'tool_use', id: 't', name: 'list_stations', input: {} }],
    });
  });
});

describe('OpenAiProvider', () => {
  beforeEach(() => {
    openaiCreate.mockReset();
    openaiCtor.mockReset();
  });

  it('builds the SDK client with apiKey and defaults model to gpt-4o', async () => {
    openaiCreate.mockResolvedValue({
      choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
    });
    const provider = new OpenAiProvider('sk-test');
    expect(openaiCtor).toHaveBeenCalledWith({ apiKey: 'sk-test' });
    await provider.chat([{ role: 'user', content: 'q' }], [], 'sys');
    expect(openaiCreate.mock.calls[0]![0].model).toBe('gpt-4o');
  });

  it('maps messages, tools, and options to the OpenAI format', async () => {
    openaiCreate.mockResolvedValue({
      choices: [{ message: { content: 'answer' }, finish_reason: 'stop' }],
    });
    const provider = new OpenAiProvider('k', 'gpt-custom');
    const messages: ChatMessage[] = [
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: 'pre',
        toolCalls: [{ id: 'c1', name: 'list_stations', arguments: { page: 1 } }],
      },
      { role: 'tool_result', content: '{"ok":true}', toolCallId: 'c1' },
    ];

    const res = await provider.chat(messages, SAMPLE_TOOLS, 'sys prompt', {
      temperature: 0.3,
      topP: 0.7,
      topK: 10,
    });

    const params = openaiCreate.mock.calls[0]![0];
    expect(params.model).toBe('gpt-custom');
    expect(params.temperature).toBe(0.3);
    expect(params.top_p).toBe(0.7);
    // OpenAI has no topK passthrough
    expect(params).not.toHaveProperty('top_k');
    expect(params.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'list_stations',
          description: 'List stations',
          parameters: SAMPLE_TOOLS[0]!.parameters,
        },
      },
    ]);
    // system prompt prepended
    expect(params.messages[0]).toEqual({ role: 'system', content: 'sys prompt' });
    expect(params.messages[1]).toEqual({ role: 'user', content: 'hi' });
    expect(params.messages[2]).toEqual({
      role: 'assistant',
      content: 'pre',
      tool_calls: [
        {
          id: 'c1',
          type: 'function',
          function: { name: 'list_stations', arguments: JSON.stringify({ page: 1 }) },
        },
      ],
    });
    expect(params.messages[3]).toEqual({
      role: 'tool',
      tool_call_id: 'c1',
      content: '{"ok":true}',
    });

    expect(res).toEqual({ content: 'answer', toolCalls: [], finishReason: 'end' });
  });

  it('maps plain assistant message and empty-content assistant tool call to null', async () => {
    openaiCreate.mockResolvedValue({
      choices: [{ message: { content: 'x' }, finish_reason: 'stop' }],
    });
    const provider = new OpenAiProvider('k');
    const messages: ChatMessage[] = [
      { role: 'assistant', content: 'plain' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 't', name: 'list_stations', arguments: {} }],
      },
      { role: 'tool_result', content: '{}' },
    ];
    await provider.chat(messages, [], 'sys');
    const params = openaiCreate.mock.calls[0]![0];
    expect(params.tools).toBeUndefined();
    expect(params.temperature).toBeUndefined();
    expect(params.top_p).toBeUndefined();
    expect(params.messages[1]).toEqual({ role: 'assistant', content: 'plain' });
    // empty string content -> null
    expect(params.messages[2].content).toBeNull();
    // tool_result with no toolCallId -> empty string
    expect(params.messages[3]).toEqual({ role: 'tool', tool_call_id: '', content: '{}' });
  });

  it('maps a tool_calls response into AiResponse', async () => {
    openaiCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 'tc',
                type: 'function',
                function: { name: 'list_stations', arguments: '{"page":3}' },
              },
              { id: 'skip', type: 'other', function: { name: 'x', arguments: '{}' } },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });
    const provider = new OpenAiProvider('k');
    const res = await provider.chat([{ role: 'user', content: 'go' }], SAMPLE_TOOLS, 'sys');
    expect(res).toEqual({
      content: null,
      toolCalls: [{ id: 'tc', name: 'list_stations', arguments: { page: 3 } }],
      finishReason: 'tool_use',
    });
  });

  it('returns an empty response when no choices are returned', async () => {
    openaiCreate.mockResolvedValue({ choices: [] });
    const provider = new OpenAiProvider('k');
    const res = await provider.chat([{ role: 'user', content: 'go' }], [], 'sys');
    expect(res).toEqual({ content: null, toolCalls: [], finishReason: 'end' });
  });

  it('propagates SDK errors', async () => {
    openaiCreate.mockRejectedValue(new Error('boom'));
    const provider = new OpenAiProvider('k');
    await expect(provider.chat([{ role: 'user', content: 'x' }], [], 'sys')).rejects.toThrow(
      'boom',
    );
  });
});

describe('GeminiProvider', () => {
  beforeEach(() => {
    geminiGenerateContent.mockReset();
    geminiGetModel.mockReset();
    geminiCtor.mockReset();
  });

  it('builds the client with apiKey and defaults model name', async () => {
    geminiGenerateContent.mockResolvedValue({
      response: { candidates: [{ content: { parts: [{ text: 'hi' }] } }] },
    });
    const provider = new GeminiProvider('g-key');
    expect(geminiCtor).toHaveBeenCalledWith('g-key');
    await provider.chat([{ role: 'user', content: 'q' }], [], 'sys');
    expect(geminiGetModel).toHaveBeenCalledWith({
      model: 'gemini-2.0-flash',
      systemInstruction: 'sys',
    });
  });

  it('maps messages, tools, and generationConfig', async () => {
    geminiGenerateContent.mockResolvedValue({
      response: { candidates: [{ content: { parts: [{ text: 'answer' }] } }] },
    });
    const provider = new GeminiProvider('k', 'gemini-pro');
    const messages: ChatMessage[] = [
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: 'pre',
        toolCalls: [{ id: 'c1', name: 'list_stations', arguments: { page: 1 } }],
      },
      { role: 'tool_result', content: '{"ok":true}', toolName: 'list_stations' },
    ];

    const res = await provider.chat(messages, SAMPLE_TOOLS, 'sys', {
      temperature: 0.2,
      topP: 0.6,
      topK: 5,
    });

    expect(geminiGetModel).toHaveBeenCalledWith({
      model: 'gemini-pro',
      systemInstruction: 'sys',
    });
    const request = geminiGenerateContent.mock.calls[0]![0];
    expect(request.generationConfig).toEqual({ temperature: 0.2, topP: 0.6, topK: 5 });
    expect(request.tools).toEqual([
      {
        functionDeclarations: [
          {
            name: 'list_stations',
            description: 'List stations',
            parameters: SAMPLE_TOOLS[0]!.parameters,
          },
        ],
      },
    ]);
    expect(request.toolConfig).toEqual({ functionCallingConfig: { mode: 'AUTO' } });
    expect(request.contents[0]).toEqual({ role: 'user', parts: [{ text: 'hi' }] });
    expect(request.contents[1]).toEqual({
      role: 'model',
      parts: [{ text: 'pre' }, { functionCall: { name: 'list_stations', args: { page: 1 } } }],
    });
    expect(request.contents[2]).toEqual({
      role: 'function',
      parts: [{ functionResponse: { name: 'list_stations', response: { ok: true } } }],
    });

    expect(res).toEqual({ content: 'answer', toolCalls: [], finishReason: 'end' });
  });

  it('omits generationConfig and tools when not provided, handles empty-content assistant and missing toolName', async () => {
    geminiGenerateContent.mockResolvedValue({
      response: { candidates: [{ content: { parts: [{ text: 'a' }] } }] },
    });
    const provider = new GeminiProvider('k');
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 't', name: 'list_stations', arguments: {} }],
      },
      { role: 'tool_result', content: '{"x":1}' },
    ];
    await provider.chat(messages, [], 'sys');
    const request = geminiGenerateContent.mock.calls[0]![0];
    expect(request.generationConfig).toBeUndefined();
    expect(request.tools).toBeUndefined();
    expect(request.toolConfig).toBeUndefined();
    // empty content -> only the functionCall part, no text part
    expect(request.contents[0]).toEqual({
      role: 'model',
      parts: [{ functionCall: { name: 'list_stations', args: {} } }],
    });
    // tool_result with no toolName -> empty string name
    expect(request.contents[1]).toEqual({
      role: 'function',
      parts: [{ functionResponse: { name: '', response: { x: 1 } } }],
    });
  });

  it('maps a functionCall response into a tool_use AiResponse with concatenated text', async () => {
    geminiGenerateContent.mockResolvedValue({
      response: {
        candidates: [
          {
            content: {
              parts: [
                { text: 'a ' },
                { text: 'b' },
                { functionCall: { name: 'list_stations', args: { page: 4 } } },
              ],
            },
          },
        ],
      },
    });
    const provider = new GeminiProvider('k');
    const res = await provider.chat([{ role: 'user', content: 'go' }], SAMPLE_TOOLS, 'sys');
    expect(res.content).toBe('a b');
    expect(res.finishReason).toBe('tool_use');
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls[0]!.name).toBe('list_stations');
    expect(res.toolCalls[0]!.arguments).toEqual({ page: 4 });
    expect(res.toolCalls[0]!.id).toMatch(/^gemini-/);
  });

  it('returns an empty response when no candidates are returned', async () => {
    geminiGenerateContent.mockResolvedValue({ response: { candidates: [] } });
    const provider = new GeminiProvider('k');
    const res = await provider.chat([{ role: 'user', content: 'go' }], [], 'sys');
    expect(res).toEqual({ content: null, toolCalls: [], finishReason: 'end' });
  });

  it('propagates SDK errors', async () => {
    geminiGenerateContent.mockRejectedValue(new Error('quota'));
    const provider = new GeminiProvider('k');
    await expect(provider.chat([{ role: 'user', content: 'x' }], [], 'sys')).rejects.toThrow(
      'quota',
    );
  });
});
