import { z } from 'zod';
import { frameResponseSchema, type AiUsage, type FrameRequest, type FrameResponse } from './contracts';
import { worldStateV2Schema } from '../sim/schema';
import type { SocietyBlueprint, WorldStateV2 } from '../sim/types';

const usageSchema = z.object({
  model: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  durationMs: z.number().finite().nonnegative(),
  estimatedCost: z.number().finite().nonnegative(),
});

const compiledPolicySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  enabled: z.boolean(),
  intensity: z.number().min(0).max(100),
  modifiers: z.array(z.object({ path: z.string(), delta: z.number().min(-100).max(100) })),
});

const absoluteEventSchema = z.object({
  id: z.string().min(1),
  originalText: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

export type CompiledPolicy = z.infer<typeof compiledPolicySchema>;
export type ParsedAbsoluteEvent = z.infer<typeof absoluteEventSchema>;
export interface AiResult<T> { data: T; usage: AiUsage }

export interface AiClient {
  generateWorld(input: { description: string; blueprint: Partial<SocietyBlueprint> }): Promise<AiResult<WorldStateV2>>;
  compilePolicy(input: { text: string; worldId: string }): Promise<AiResult<CompiledPolicy>>;
  parseAbsoluteEvent(input: { text: string; worldId: string; residentId?: string }): Promise<AiResult<ParsedAbsoluteEvent>>;
  runFrame(input: FrameRequest): Promise<AiResult<FrameResponse>>;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class BrowserAiClient implements AiClient {
  constructor(private readonly fetcher: Fetcher = fetch) {}

  private async post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<AiResult<T>> {
    const response = await this.fetcher(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `AI 网关请求失败：${response.status}`);
    }
    const envelope = z.object({ data: schema, usage: usageSchema }).parse(await response.json());
    return envelope;
  }

  generateWorld(input: { description: string; blueprint: Partial<SocietyBlueprint> }): Promise<AiResult<WorldStateV2>> {
    return this.post('/api/world/generate', input, worldStateV2Schema);
  }

  compilePolicy(input: { text: string; worldId: string }): Promise<AiResult<CompiledPolicy>> {
    return this.post('/api/policy/compile', input, compiledPolicySchema);
  }

  parseAbsoluteEvent(input: { text: string; worldId: string; residentId?: string }): Promise<AiResult<ParsedAbsoluteEvent>> {
    return this.post('/api/event/parse', input, absoluteEventSchema);
  }

  runFrame(input: FrameRequest): Promise<AiResult<FrameResponse>> {
    return this.post('/api/frame/run', input, frameResponseSchema);
  }
}
