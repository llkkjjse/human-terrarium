import { z } from 'zod';
import { absoluteEventSchema, compiledPolicySchema, type AiResult } from '../src/ai/client';
import { frameResponseSchema, type FrameRequest, type FrameResponse } from '../src/ai/contracts';
import { worldStateV2Schema } from '../src/sim/schema';
import { createGeneratedWorld } from '../src/sim/generation';
import { scenarioSchema } from '../src/sim/scenarios';
import type { SocietyBlueprint, WorldStateV2 } from '../src/sim/types';
import { districts } from '../src/sim/world';
import { systemPrompt } from './prompts';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface DeepSeekOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetcher?: Fetcher;
  now?: () => number;
}

const upstreamSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative().default(0),
    completion_tokens: z.number().int().nonnegative().default(0),
  }).default({ prompt_tokens: 0, completion_tokens: 0 }),
});

interface RawCompletion {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

const worldPlanSchema = z.object({
  name: z.string().min(1).max(40),
  description: z.string().min(1).max(240),
  parameters: scenarioSchema.shape.parameters,
  policies: scenarioSchema.shape.policies,
});

const defaultSocial: SocietyBlueprint['social'] = {
  inequality: 55,
  mobility: 45,
  trust: 55,
  corruption: 20,
  crimePressure: 35,
  gossip: 55,
};

function stableSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0 || 1;
}

export class DeepSeekService {
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetcher: Fetcher;
  private readonly now: () => number;

  constructor(private readonly options: DeepSeekOptions) {
    this.model = options.model ?? 'deepseek-flash';
    this.baseUrl = (options.baseUrl ?? 'https://api.deepseek.com').replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
  }

  private async complete(messages: Array<{ role: 'system' | 'user'; content: string }>): Promise<RawCompletion> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          response_format: { type: 'json_object' },
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`DeepSeek API 请求失败（${response.status}）`);
      const parsed = upstreamSchema.parse(await response.json());
      return {
        content: parsed.choices[0].message.content,
        inputTokens: parsed.usage.prompt_tokens,
        outputTokens: parsed.usage.completion_tokens,
      };
    } catch (error) {
      if (controller.signal.aborted) throw new Error('DeepSeek 请求超时');
      if (error instanceof Error && error.message.startsWith('DeepSeek API 请求失败')) throw error;
      throw new Error('DeepSeek 网络请求失败');
    } finally {
      clearTimeout(timeout);
    }
  }

  async requestJson<T>(system: string, input: unknown, schema: z.ZodType<T>): Promise<AiResult<T>> {
    const startedAt = this.now();
    const responseSchema = z.toJSONSchema(schema);
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify({ input, responseSchema }) },
    ];
    const first = await this.complete(messages);
    let completion = first;
    let data: T;
    try {
      data = schema.parse(JSON.parse(first.content));
    } catch {
      completion = await this.complete([
        ...messages,
        { role: 'user', content: `上一个响应不是有效 JSON 或不符合模式，请只修复并返回 JSON：${first.content}` },
      ]);
      try {
        data = schema.parse(JSON.parse(completion.content));
      } catch {
        throw new Error('DeepSeek 返回的 JSON 无效');
      }
    }
    const inputTokens = first.inputTokens + (completion === first ? 0 : completion.inputTokens);
    const outputTokens = first.outputTokens + (completion === first ? 0 : completion.outputTokens);
    return {
      data,
      usage: {
        model: this.model,
        inputTokens,
        outputTokens,
        durationMs: Math.max(0, this.now() - startedAt),
        estimatedCost: inputTokens * 0.00000014 + outputTokens * 0.00000028,
      },
    };
  }

  async generateWorld(input: { description: string; blueprint: Partial<SocietyBlueprint> }): Promise<AiResult<WorldStateV2>> {
    const plan = await this.requestJson(systemPrompt('world'), input, worldPlanSchema);
    const seed = stableSeed(JSON.stringify({ description: input.description, plan: plan.data }));
    const blueprint: SocietyBlueprint = {
      schemaVersion: 2,
      id: input.blueprint.id ?? `blueprint-${seed.toString(36)}`,
      name: input.blueprint.name ?? plan.data.name,
      description: input.blueprint.description ?? plan.data.description,
      sourceText: input.description,
      parameters: input.blueprint.parameters ?? plan.data.parameters,
      policies: input.blueprint.policies ?? plan.data.policies,
      districts: structuredClone(input.blueprint.districts ?? districts),
      social: structuredClone(input.blueprint.social ?? defaultSocial),
    };
    const data = worldStateV2Schema.parse(createGeneratedWorld({ seed, blueprint }));
    return { data, usage: plan.usage };
  }

  compilePolicy(input: { text: string; worldId: string }) {
    return this.requestJson(systemPrompt('policy'), input, compiledPolicySchema);
  }

  parseAbsoluteEvent(input: { text: string; worldId: string; residentId?: string }) {
    return this.requestJson(systemPrompt('event'), input, absoluteEventSchema);
  }

  runFrame(input: FrameRequest): Promise<AiResult<FrameResponse>> {
    return this.requestJson(systemPrompt('frame'), input, frameResponseSchema);
  }
}
