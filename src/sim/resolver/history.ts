import type {
  ConversationRecord,
  HistoryBatch,
  LifeLogRecord,
  PersistentEventRecord,
  PersistentMemoryRecord,
} from '../../persistence/database';
import type { ConversationDraft, MemoryUpdate } from '../../ai/contracts';
import type { WorldEvent, WorldEventType, WorldStateV2 } from '../types';

export function emptyHistory(): HistoryBatch {
  return {
    lifeLogs: [],
    conversations: [],
    events: [],
    knowledge: [],
    memories: [],
  };
}

function sequence(history: HistoryBatch): number {
  return history.lifeLogs.length
    + history.conversations.length
    + history.events.length
    + history.knowledge.length
    + history.memories.length;
}

export function appendLifeLog(
  history: HistoryBatch,
  world: WorldStateV2,
  input: Omit<LifeLogRecord, 'id' | 'worldId' | 'tick'> & { tick?: number },
): LifeLogRecord {
  const record: LifeLogRecord = {
    id: `life-${world.tick}-${sequence(history)}-${input.residentId}`,
    worldId: world.blueprint.id,
    tick: input.tick ?? world.tick,
    residentId: input.residentId,
    kind: input.kind,
    summary: input.summary,
    detail: input.detail,
    causalId: input.causalId,
  };
  history.lifeLogs.push(record);
  return record;
}

export function appendGlobalEvent(
  history: HistoryBatch,
  world: WorldStateV2,
  input: {
    type: WorldEventType;
    title: string;
    detail: string;
    residentIds: string[];
    causalId?: string;
  },
): PersistentEventRecord {
  const event: PersistentEventRecord = {
    id: `event-${world.tick}-${world.nextEventSequence++}`,
    worldId: world.blueprint.id,
    tick: world.tick,
    ...input,
  };
  history.events.push(event);
  return event;
}

export function appendConversation(
  history: HistoryBatch,
  world: WorldStateV2,
  draft: ConversationDraft,
  causalId?: string,
): ConversationRecord {
  const record: ConversationRecord = {
    id: `conversation-${world.tick}-${sequence(history)}-${draft.id}`,
    worldId: world.blueprint.id,
    tick: world.tick,
    participantIds: [...draft.participantIds],
    locationId: draft.locationId,
    text: draft.lines.map((line) => `${line.speakerId}: ${line.text}`).join('\n'),
    causalId,
  };
  history.conversations.push(record);
  return record;
}

export function appendMemory(
  history: HistoryBatch,
  world: WorldStateV2,
  update: MemoryUpdate,
  causalId?: string,
): PersistentMemoryRecord {
  const resident = world.residents.find((item) => item.id === update.residentId);
  if (!resident) throw new Error(`Unknown memory resident: ${update.residentId}`);
  const tone = update.importance >= 70 ? 'negative' : 'neutral';
  resident.memories.push({
    id: update.id,
    text: update.text,
    tone,
    tick: world.tick,
    causalId,
  });
  const record: PersistentMemoryRecord = {
    id: `memory-${world.tick}-${sequence(history)}-${update.id}`,
    worldId: world.blueprint.id,
    residentId: update.residentId,
    tick: world.tick,
    text: update.text,
    summary: false,
    causalId,
  };
  history.memories.push(record);
  return record;
}

export function projectEvents(history: HistoryBatch): WorldEvent[] {
  return history.events.map(({ worldId: _worldId, ...event }) => event);
}
