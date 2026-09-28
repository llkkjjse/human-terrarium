import { scenarioSchema } from '../sim/scenarios';
import type { WorldState } from '../sim/types';
import { stepWorld } from '../sim/world';

export interface SaveEnvelope {
  schemaVersion: 1;
  savedAt: number;
  checksum: string;
  payload: WorldState;
}

function hash(input: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(16).padStart(8, '0');
}

function assertWorld(value: unknown): asserts value is WorldState {
  if (!value || typeof value !== 'object') throw new Error('存档内容无效');
  const world = value as Partial<WorldState>;
  if (world.schemaVersion !== 1 || !Number.isInteger(world.tick) || !Array.isArray(world.residents) || world.residents.length === 0) {
    throw new Error('存档版本或世界数据无效');
  }
  scenarioSchema.parse(world.scenario);
}

export function createSave(world: WorldState, savedAt = Date.now()): SaveEnvelope {
  const payload = structuredClone(world);
  return { schemaVersion: 1, savedAt, payload, checksum: hash(JSON.stringify(payload)) };
}

export function parseSave(input: string | SaveEnvelope): WorldState {
  const envelope = typeof input === 'string' ? JSON.parse(input) as SaveEnvelope : input;
  if (envelope.schemaVersion !== 1) throw new Error('不支持的存档版本');
  if (hash(JSON.stringify(envelope.payload)) !== envelope.checksum) throw new Error('存档校验失败');
  assertWorld(envelope.payload);
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

