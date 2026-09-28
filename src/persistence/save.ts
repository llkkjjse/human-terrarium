import { z } from 'zod';
import { scenarioSchema } from '../sim/scenarios';
import type { WorldState } from '../sim/types';
import { stepWorld } from '../sim/world';

export interface SaveEnvelope {
  schemaVersion: 1;
  savedAt: number;
  checksum: string;
  payload: WorldState;
}

const bounded = z.number().finite().min(0).max(100);
const districtIdSchema = z.enum(['residential', 'commerce', 'commons', 'municipal']);
const roleSchema = z.enum(['supply', 'commerce', 'care', 'maintenance', 'safety', 'culture']);
const activitySchema = z.enum(['idle', 'sleep', 'eat', 'work', 'socialize', 'relax', 'seek-care', 'commute']);
const eventTypeSchema = z.enum(['tick', 'activity', 'dialogue', 'relationship', 'economy', 'policy', 'opportunity', 'health', 'migration', 'death', 'system']);

const memorySchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  tone: z.enum(['positive', 'neutral', 'negative']),
  tick: z.number().int().nonnegative(),
  causalId: z.string().optional(),
});

const residentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  age: z.number().int().min(0).max(130),
  role: roleSchema,
  districtId: districtIdSchema,
  homeDistrictId: z.literal('residential'),
  x: z.number().finite(),
  y: z.number().finite(),
  income: bounded,
  savings: bounded,
  employed: z.boolean(),
  alive: z.boolean(),
  color: z.string().min(1),
  activity: activitySchema,
  personality: z.object({
    extraversion: bounded,
    diligence: bounded,
    agreeableness: bounded,
    curiosity: bounded,
    resilience: bounded,
  }),
  traits: z.array(z.string()),
  needs: z.object({
    hunger: bounded,
    energy: bounded,
    health: bounded,
    hygiene: bounded,
    social: bounded,
    leisure: bounded,
    safety: bounded,
    purpose: bounded,
  }),
  relationships: z.record(z.string(), bounded),
  memories: z.array(memorySchema),
});

const districtSchema = z.object({
  id: districtIdSchema,
  name: z.string().min(1),
  description: z.string(),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  color: z.number().int().min(0).max(0xffffff),
});

const eventSchema = z.object({
  id: z.string().min(1),
  tick: z.number().int().nonnegative(),
  type: eventTypeSchema,
  title: z.string(),
  detail: z.string(),
  residentIds: z.array(z.string()),
  causalId: z.string().optional(),
});

const worldSchema = z.object({
  schemaVersion: z.literal(1),
  seed: z.number().finite(),
  rngState: z.number().finite(),
  tick: z.number().int().nonnegative(),
  day: z.number().int().positive(),
  minuteOfDay: z.number().int().min(0).max(1439),
  timeScale: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(4)]),
  scenario: scenarioSchema,
  districts: z.array(districtSchema).length(4),
  residents: z.array(residentSchema).min(1),
  metrics: z.object({
    vitality: bounded,
    health: bounded,
    trust: bounded,
    mobility: bounded,
    equality: bounded,
    safety: bounded,
  }),
  events: z.array(eventSchema).max(240),
  nextEventSequence: z.number().int().nonnegative(),
  lastSavedAt: z.number().finite().nonnegative(),
}).superRefine((world, context) => {
  const districtIds = new Set(world.districts.map((district) => district.id));
  for (const required of districtIdSchema.options) {
    if (!districtIds.has(required)) context.addIssue({ code: 'custom', path: ['districts'], message: `缺少区域 ${required}` });
  }
  const residentIds = new Set<string>();
  for (const [index, resident] of world.residents.entries()) {
    if (!districtIds.has(resident.districtId)) context.addIssue({ code: 'custom', path: ['residents', index, 'districtId'], message: '居民引用了不存在的区域' });
    if (residentIds.has(resident.id)) context.addIssue({ code: 'custom', path: ['residents', index, 'id'], message: '居民 ID 重复' });
    residentIds.add(resident.id);
  }
  const eventIds = new Set<string>();
  for (const [index, event] of world.events.entries()) {
    if (eventIds.has(event.id)) context.addIssue({ code: 'custom', path: ['events', index, 'id'], message: '事件 ID 重复' });
    eventIds.add(event.id);
  }
});

function hash(input: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(16).padStart(8, '0');
}

function assertWorld(value: unknown): asserts value is WorldState {
  const result = worldSchema.safeParse(value);
  if (!result.success) throw new Error('存档版本或世界数据无效');
}

export function createSave(world: WorldState, savedAt = Date.now()): SaveEnvelope {
  world.lastSavedAt = savedAt;
  const payload = structuredClone(world);
  return { schemaVersion: 1, savedAt, payload, checksum: hash(JSON.stringify(payload)) };
}

export function parseSave(input: string | SaveEnvelope): WorldState {
  let value: unknown;
  try {
    value = typeof input === 'string' ? JSON.parse(input) : input;
  } catch {
    throw new Error('存档内容无效');
  }
  if (!value || typeof value !== 'object') throw new Error('存档内容无效');
  const envelope = value as Partial<SaveEnvelope>;
  if (envelope.schemaVersion !== 1) throw new Error('不支持的存档版本');
  if (!Number.isFinite(envelope.savedAt) || typeof envelope.checksum !== 'string' || !('payload' in envelope)) {
    throw new Error('存档内容无效');
  }
  const serialized = JSON.stringify(envelope.payload);
  if (typeof serialized !== 'string' || hash(serialized) !== envelope.checksum) throw new Error('存档校验失败');
  assertWorld(envelope.payload);
  if (envelope.savedAt !== envelope.payload.lastSavedAt) throw new Error('存档时间无效');
  return structuredClone(envelope.payload);
}

export function applyOfflineProgress(world: WorldState, now = Date.now()): {
  world: WorldState;
  ticksApplied: number;
  capped: boolean;
  elapsedMs: number;
} {
  const elapsedMs = Math.max(0, now - world.lastSavedAt);
  const rawTicks = Math.floor(elapsedMs / (15 * 60 * 1_000));
  const ticksApplied = Math.min(rawTicks, 7 * 24 * 4);
  const next = structuredClone(world);
  for (let index = 0; index < ticksApplied; index += 1) stepWorld(next);
  next.lastSavedAt = now;
  return { world: next, ticksApplied, capped: rawTicks > ticksApplied, elapsedMs };
}
