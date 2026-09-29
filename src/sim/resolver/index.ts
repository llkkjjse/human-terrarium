import type { FrameResponse } from '../../ai/contracts';
import type { HistoryBatch } from '../../persistence/database';
import { nextRandom } from '../rng';
import type {
  FrameGranularity,
  Policy,
  QueuedWorldChange,
  WorldEvent,
  WorldStateV2,
} from '../types';
import { resolveCrime, type CrimeEvidence } from './crime';
import { resolveEconomy } from './economy';
import { appendGlobalEvent, appendMemory, emptyHistory, projectEvents } from './history';
import { resolveHealth } from './health';
import { resolveKnowledge } from './knowledge';
import { prioritizeAction, type PrioritizedAction } from './priority';
import { resolveRoutine } from './routine';

export interface PreparedAbsoluteEvent {
  id: string;
  originalText: string;
  title: string;
  detail: string;
  residentIds: string[];
}

export interface PreparedFrame {
  world: WorldStateV2;
  changes: QueuedWorldChange[];
  absoluteEvents: PreparedAbsoluteEvent[];
  locks: Record<string, string[]>;
}

export interface FrameResolution {
  world: WorldStateV2;
  history: HistoryBatch;
  globalEvents: WorldEvent[];
}

export interface ResolverContext {
  world: WorldStateV2;
  response: FrameResponse;
  granularity: FrameGranularity;
  hours: number;
  history: HistoryBatch;
  locks: Record<string, string[]>;
  actions: Record<string, PrioritizedAction>;
  crimes: CrimeEvidence[];
  random(): number;
}

const hoursByGranularity: Record<FrameGranularity, number> = { '1h': 1, '12h': 12, '1d': 24 };
const allowedResidentPaths = new Set([
  'alive',
  'activity',
  'districtId',
  'legalStatus',
  'customTrait',
  'playerGoal',
  'personalGoal',
  'currentPlan',
  'healthConditions',
  'needs.health',
  'needs.hunger',
  'needs.energy',
  'needs.hygiene',
  'needs.social',
  'needs.leisure',
  'needs.safety',
  'needs.purpose',
  'finances.cash',
  'finances.income',
  'finances.debt',
]);

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (!next || typeof next !== 'object' || Array.isArray(next)) throw new Error(`Invalid mutation path: ${path}`);
    cursor = next as Record<string, unknown>;
  }
  cursor[parts.at(-1)!] = structuredClone(value);
}

function residentIdsFor(change: QueuedWorldChange, world: WorldStateV2): string[] {
  const payloadId = typeof change.payload.residentId === 'string' ? change.payload.residentId : undefined;
  const ids = Array.isArray(change.payload.residentIds)
    ? change.payload.residentIds.filter((id): id is string => typeof id === 'string')
    : [];
  if ('residentId' in change && change.residentId) ids.push(change.residentId);
  if (payloadId) ids.push(payloadId);
  return [...new Set(ids)].filter((id) => world.residents.some((resident) => resident.id === id));
}

function payloadSet(payload: Record<string, unknown>): Record<string, unknown> {
  const explicit = payload.set;
  if (explicit && typeof explicit === 'object' && !Array.isArray(explicit)) {
    return explicit as Record<string, unknown>;
  }
  return Object.fromEntries(
    [...allowedResidentPaths]
      .filter((key) => key in payload)
      .map((key) => [key, payload[key]]),
  );
}

function applyAbsolute(
  world: WorldStateV2,
  change: Extract<QueuedWorldChange, { type: 'absolute-event' }>,
  locks: Record<string, string[]>,
): PreparedAbsoluteEvent {
  const residentIds = residentIdsFor(change, world);
  const changes = payloadSet(change.payload);
  for (const residentId of residentIds) {
    const resident = world.residents.find((item) => item.id === residentId)!;
    for (const [path, value] of Object.entries(changes)) {
      if (!allowedResidentPaths.has(path)) continue;
      setPath(resident as unknown as Record<string, unknown>, path, value);
      (locks[residentId] ??= []).push(path);
    }
    if (typeof change.payload.healthDelta === 'number') {
      resident.needs.health = Math.max(0, Math.min(100, resident.needs.health + change.payload.healthDelta));
      (locks[residentId] ??= []).push('needs.health');
    }
    if (typeof change.payload.cashDelta === 'number') {
      resident.finances.cash += change.payload.cashDelta;
      (locks[residentId] ??= []).push('finances.cash');
    }
  }
  return {
    id: change.id,
    originalText: change.originalText,
    title: `\u73a9\u5bb6\u5f3a\u5236\u4e8b\u4ef6: ${typeof change.payload.title === 'string' ? change.payload.title : 'Forced world event'}`,
    detail: `\u539f\u6587\uff1a${change.originalText}\n\u76f4\u63a5\u53d8\u66f4\uff1a${typeof change.payload.detail === 'string' ? change.payload.detail : JSON.stringify(changes)}`,
    residentIds,
  };
}

function mergeObject(target: Record<string, unknown>, value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const [key, next] of Object.entries(value)) target[key] = structuredClone(next);
}

function applyResidentEdit(world: WorldStateV2, change: Extract<QueuedWorldChange, { type: 'resident-edit' }>): void {
  const resident = world.residents.find((item) => item.id === change.residentId);
  if (!resident) throw new Error(`Unknown resident edit target: ${change.residentId}`);
  for (const field of ['customTrait', 'playerGoal', 'personalGoal', 'legalStatus', 'districtId', 'activity'] as const) {
    if (field in change.payload) (resident as unknown as Record<string, unknown>)[field] = structuredClone(change.payload[field]);
  }
  if (Array.isArray(change.payload.currentPlan)) resident.currentPlan = structuredClone(change.payload.currentPlan) as string[];
  if (Array.isArray(change.payload.healthConditions)) resident.healthConditions = structuredClone(change.payload.healthConditions) as string[];
  mergeObject(resident.abilities as unknown as Record<string, unknown>, change.payload.abilities);
  mergeObject(resident.finances as unknown as Record<string, unknown>, change.payload.finances);
  mergeObject(resident.appearance as unknown as Record<string, unknown>, change.payload.appearance);
  mergeObject(resident.needs as unknown as Record<string, unknown>, change.payload.needs);
}

function applyPolicy(world: WorldStateV2, change: Extract<QueuedWorldChange, { type: 'policy' }>): void {
  const policy = change.payload.policy as Policy | undefined;
  if (policy?.id) {
    const index = world.blueprint.policies.findIndex((item) => item.id === policy.id);
    if (index >= 0) world.blueprint.policies[index] = structuredClone(policy);
    else world.blueprint.policies.push(structuredClone(policy));
    world.scenario.policies = structuredClone(world.blueprint.policies);
    return;
  }
  const id = typeof change.payload.id === 'string' ? change.payload.id : undefined;
  const existing = id ? world.blueprint.policies.find((item) => item.id === id) : undefined;
  if (existing) {
    if (typeof change.payload.enabled === 'boolean') existing.enabled = change.payload.enabled;
    if (typeof change.payload.intensity === 'number') existing.intensity = change.payload.intensity;
    if (typeof change.payload.description === 'string') existing.description = change.payload.description;
    world.scenario.policies = structuredClone(world.blueprint.policies);
  }
}

function applyEffectivePolicyParameters(world: WorldStateV2): void {
  const effective = structuredClone(world.blueprint.parameters);
  for (const policy of world.blueprint.policies.filter((item) => item.enabled)) {
    for (const modifier of policy.modifiers) {
      const [group, key] = modifier.path.split('.');
      const bucket = effective[group as keyof typeof effective] as unknown as Record<string, number> | undefined;
      if (!bucket || typeof bucket[key] !== 'number') continue;
      bucket[key] = Math.max(0, Math.min(100, bucket[key] + modifier.delta * policy.intensity / 100));
    }
  }
  world.scenario.parameters = effective;
}

export function prepareFrame(world: WorldStateV2, changes: QueuedWorldChange[]): PreparedFrame {
  const next = structuredClone(world);
  const copiedChanges = structuredClone(changes);
  const locks: Record<string, string[]> = {};
  const absoluteEvents: PreparedAbsoluteEvent[] = [];
  for (const change of copiedChanges.filter((item) => item.type === 'absolute-event')) {
    absoluteEvents.push(applyAbsolute(next, change, locks));
  }
  for (const change of copiedChanges.filter((item) => item.type === 'policy')) applyPolicy(next, change);
  applyEffectivePolicyParameters(next);
  for (const change of copiedChanges.filter((item) => item.type === 'resident-edit')) applyResidentEdit(next, change);
  const appliedIds = new Set(copiedChanges.map((change) => change.id));
  next.queuedChanges = next.queuedChanges.filter((change) => !appliedIds.has(change.id));
  return { world: next, changes: copiedChanges, absoluteEvents, locks };
}

function advanceTime(world: WorldStateV2, hours: number): void {
  world.tick += hours;
  const total = world.minuteOfDay + hours * 60;
  world.day += Math.floor(total / 1440);
  world.minuteOfDay = total % 1440;
}

export function resolveFrame(input: {
  prepared: PreparedFrame;
  response: FrameResponse;
  granularity: FrameGranularity;
}): FrameResolution {
  const world = structuredClone(input.prepared.world);
  const response = structuredClone(input.response);
  const history = emptyHistory();
  const hours = hoursByGranularity[input.granularity];
  advanceTime(world, hours);
  const actions: Record<string, PrioritizedAction> = {};
  for (const resident of world.residents) {
    const proposed = response.residentActions.find((item) => item.residentId === resident.id);
    if (!proposed) throw new Error(`Missing action for resident: ${resident.id}`);
    actions[resident.id] = prioritizeAction(resident, proposed);
  }
  const context: ResolverContext = {
    world,
    response,
    granularity: input.granularity,
    hours,
    history,
    locks: structuredClone(input.prepared.locks),
    actions,
    crimes: [],
    random() {
      const random = nextRandom(world.rngState);
      world.rngState = random.state;
      return random.value;
    },
  };

  for (const forced of input.prepared.absoluteEvents) {
    appendGlobalEvent(history, world, {
      type: 'system',
      title: forced.title,
      detail: forced.detail,
      residentIds: forced.residentIds,
      causalId: forced.id,
    });
  }
  resolveRoutine(context);
  resolveEconomy(context);
  resolveHealth(context);
  resolveCrime(context);
  resolveKnowledge(context);
  for (const update of response.memoryUpdates) appendMemory(history, world, update);

  const globalEvents = projectEvents(history);
  world.events.push(...globalEvents);
  world.frameGranularity = input.granularity;
  return { world, history, globalEvents };
}

export type { HistoryBatch };
