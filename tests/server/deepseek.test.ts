import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { DeepSeekService } from '../../server/deepseek';
import { getPreset } from '../../src/sim/scenarios';

function upstream(content: string, status = 200): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 120, completion_tokens: 30 },
  }), { status, headers: { 'content-type': 'application/json' } });
}

describe('DeepSeekService', () => {
  test('uses deepseek-flash and strict JSON while recording usage and duration', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => upstream('{"answer":"ok"}'));
    const times = [1_000, 1_125];
    const service = new DeepSeekService({
      apiKey: 'sk-test-secret',
      fetcher,
      now: () => times.shift() ?? 1_125,
    });

    const result = await service.requestJson('system prompt', { question: 'hello' }, z.object({ answer: z.string() }));

    expect(result.data).toEqual({ answer: 'ok' });
    expect(result.usage).toMatchObject({
      model: 'deepseek-flash',
      inputTokens: 120,
      outputTokens: 30,
      durationMs: 125,
    });
    const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(request).toMatchObject({
      model: 'deepseek-flash',
      response_format: { type: 'json_object' },
    });
    const userMessage = JSON.parse(request.messages[1].content);
    expect(userMessage.input).toEqual({ question: 'hello' });
    expect(userMessage.responseSchema).toMatchObject({
      type: 'object',
      properties: { answer: { type: 'string' } },
      required: ['answer'],
    });
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ authorization: 'Bearer sk-test-secret' });
  });

  test('makes exactly one repair request for malformed JSON', async () => {
    let calls = 0;
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      calls += 1;
      return calls === 1 ? upstream('{broken') : upstream('{"answer":"repaired"}');
    });
    const service = new DeepSeekService({ apiKey: 'sk-repair', fetcher });

    const result = await service.requestJson('system', { value: 1 }, z.object({ answer: z.string() }));

    expect(result.data.answer).toBe('repaired');
    expect(fetcher).toHaveBeenCalledTimes(2);
    const repairBody = JSON.parse(String(fetcher.mock.calls[1][1]?.body));
    expect(repairBody.messages.at(-1).content).toContain('修复');
  });

  test('asks AI for a compact social plan and generates all residents locally', async () => {
    const parameters = getPreset('stable-modern').parameters;
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => upstream(JSON.stringify({
      name: 'Harbor Commons',
      description: 'A divided neighborhood with limited upward mobility.',
      parameters,
      policies: [],
    })));
    const service = new DeepSeekService({ apiKey: 'sk-world-plan', fetcher });

    const result = await service.generateWorld({
      description: 'A sharply divided neighborhood.',
      blueprint: {
        social: {
          inequality: 82,
          mobility: 28,
          trust: 44,
          corruption: 31,
          crimePressure: 47,
          gossip: 68,
        },
      },
    });

    expect(result.data.residents).toHaveLength(24);
    expect(result.data.blueprint.name).toBe('Harbor Commons');
    expect(result.data.blueprint.sourceText).toBe('A sharply divided neighborhood.');
    expect(result.data.blueprint.social.inequality).toBe(82);
    const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    const userMessage = JSON.parse(request.messages[1].content);
    expect(userMessage.responseSchema.properties).toHaveProperty('parameters');
    expect(userMessage.responseSchema.properties).not.toHaveProperty('residents');
    expect(userMessage.responseSchema.properties).not.toHaveProperty('assets');
  });

  test('does not retry network or balance failures and never leaks the key', async () => {
    const network = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.reject(new Error('socket failed sk-network-secret')));
    const networkService = new DeepSeekService({ apiKey: 'sk-network-secret', fetcher: network });
    await expect(networkService.requestJson('system', {}, z.object({ ok: z.boolean() }))).rejects.not.toThrow('sk-network-secret');
    expect(network).toHaveBeenCalledTimes(1);

    const balance = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response('insufficient balance sk-balance-secret', { status: 402 })));
    const balanceService = new DeepSeekService({ apiKey: 'sk-balance-secret', fetcher: balance });
    await expect(balanceService.requestJson('system', {}, z.object({ ok: z.boolean() }))).rejects.not.toThrow('sk-balance-secret');
    expect(balance).toHaveBeenCalledTimes(1);
  });

  test('times out an upstream call without retrying it', async () => {
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const service = new DeepSeekService({ apiKey: 'sk-timeout', fetcher, timeoutMs: 5 });

    await expect(service.requestJson('system', {}, z.object({ ok: z.boolean() }))).rejects.toThrow('超时');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test('allows a complex default request to run longer than thirty seconds', () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        signal = init?.signal ?? undefined;
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      }));
      const service = new DeepSeekService({ apiKey: 'sk-long-world', fetcher });
      void service.requestJson('system', {}, z.object({ answer: z.string() })).catch(() => undefined);

      vi.advanceTimersByTime(31_000);
      expect(signal?.aborted).toBe(false);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});
