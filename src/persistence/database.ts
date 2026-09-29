import Dexie, { type Table } from 'dexie';
import { createSave, parseSave, type SaveEnvelope } from './save';
import { migrateSaveToV2 } from './migrate';
import { worldStateV2Schema } from '../sim/schema';
import type { KnowledgeRecord, ResidentV2, WorldEvent, WorldState, WorldStateV2 } from '../sim/types';

interface SaveRecord extends SaveEnvelope {
  slot: 'primary' | 'backup';
}

interface WorldRecord {
  id: string;
  updatedAt: number;
  state: WorldStateV2;
}

interface ResidentRecord extends ResidentV2 {
  worldId: string;
}

export interface LifeLogRecord {
  id: string;
  worldId: string;
  residentId: string;
  tick: number;
  kind: string;
  summary: string;
  detail: string;
  causalId?: string;
}

export interface ConversationRecord {
  id: string;
  worldId: string;
  tick: number;
  participantIds: string[];
  locationId: string;
  text: string;
  causalId?: string;
}

export interface PersistentEventRecord extends WorldEvent {
  worldId: string;
}

export interface PersistentKnowledgeRecord extends KnowledgeRecord {
  worldId: string;
}

export interface PersistentMemoryRecord {
  id: string;
  worldId: string;
  residentId: string;
  tick: number;
  text: string;
  summary: boolean;
  causalId?: string;
}

export interface AiRunRecord {
  id: string;
  worldId: string;
  frameStartTick: number;
  status: 'success' | 'failed';
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  error?: string;
}

export interface HistoryBatch {
  lifeLogs: LifeLogRecord[];
  conversations: ConversationRecord[];
  events: PersistentEventRecord[];
  knowledge: PersistentKnowledgeRecord[];
  memories: PersistentMemoryRecord[];
}

export interface PageQuery {
  worldId: string;
  residentId?: string;
  limit: number;
  offset: number;
}

interface IndexedDbDependencies {
  indexedDB: IDBFactory;
  IDBKeyRange: typeof IDBKeyRange;
}

class TerrariumDatabase extends Dexie {
  saves!: Table<SaveRecord, SaveRecord['slot']>;
  worlds!: Table<WorldRecord, string>;
  residents!: Table<ResidentRecord, [string, string]>;
  lifeLogs!: Table<LifeLogRecord, string>;
  conversations!: Table<ConversationRecord, string>;
  events!: Table<PersistentEventRecord, string>;
  knowledge!: Table<PersistentKnowledgeRecord, string>;
  memories!: Table<PersistentMemoryRecord, string>;
  aiRuns!: Table<AiRunRecord, string>;

  constructor(name: string, dependencies?: IndexedDbDependencies) {
    super(name, dependencies);
    this.version(1).stores({ saves: 'slot,savedAt' });
    this.version(2).stores({
      saves: 'slot,savedAt',
      worlds: 'id,updatedAt',
      residents: '[worldId+id],worldId,id',
      lifeLogs: 'id,worldId,residentId,tick,[worldId+residentId]',
      conversations: 'id,worldId,tick,*participantIds',
      events: 'id,worldId,tick',
      knowledge: 'id,worldId,residentId,subjectId',
      memories: 'id,worldId,residentId,tick',
      aiRuns: 'id,worldId,frameStartTick',
    });
  }
}

export class SaveDatabase {
  private readonly database: TerrariumDatabase;

  constructor(name = 'human-terrarium', dependencies?: IndexedDbDependencies) {
    this.database = new TerrariumDatabase(name, dependencies);
  }

  async save(world: WorldState, savedAt = Date.now()): Promise<void> {
    await this.database.transaction('rw', this.database.saves, async () => {
      const current = await this.database.saves.get('primary');
      if (current) {
        try {
          parseSave(current);
          await this.database.saves.put({ ...current, slot: 'backup' });
        } catch {
          // A corrupt primary must never replace the last known-good backup.
        }
      }
      await this.database.saves.put({ ...createSave(world, savedAt), slot: 'primary' });
    });
  }

  async load(): Promise<WorldState> {
    const primary = await this.database.saves.get('primary');
    if (primary) {
      try {
        return parseSave(primary);
      } catch {
        // Fall through to the last known-good backup.
      }
    }
    const backup = await this.database.saves.get('backup');
    if (!backup) throw new Error('没有可用存档');
    return parseSave(backup);
  }

  async loadBackup(): Promise<WorldState | null> {
    const backup = await this.database.saves.get('backup');
    return backup ? parseSave(backup) : null;
  }

  async loadV2(): Promise<WorldStateV2> {
    const current = await this.database.worlds.orderBy('updatedAt').last();
    if (current) return structuredClone(worldStateV2Schema.parse(current.state));
    const legacy = await this.load();
    return migrateSaveToV2(createSave(legacy, legacy.lastSavedAt)).payload;
  }

  async commitFrame(world: WorldStateV2, history: HistoryBatch, aiRun: AiRunRecord): Promise<void> {
    const next = structuredClone(worldStateV2Schema.parse(world));
    const worldId = next.blueprint.id;
    const records = next.residents.map((resident) => ({ ...resident, worldId }));
    await this.database.transaction(
      'rw',
      [
        this.database.worlds,
        this.database.residents,
        this.database.lifeLogs,
        this.database.conversations,
        this.database.events,
        this.database.knowledge,
        this.database.memories,
        this.database.aiRuns,
      ],
      async () => {
        await this.database.worlds.put({ id: worldId, updatedAt: Date.now(), state: next });
        await this.database.residents.where('worldId').equals(worldId).delete();
        await this.database.residents.bulkAdd(records);
        if (history.lifeLogs.length) await this.database.lifeLogs.bulkAdd(structuredClone(history.lifeLogs));
        if (history.conversations.length) await this.database.conversations.bulkAdd(structuredClone(history.conversations));
        if (history.events.length) await this.database.events.bulkAdd(structuredClone(history.events));
        if (history.knowledge.length) await this.database.knowledge.bulkAdd(structuredClone(history.knowledge));
        if (history.memories.length) await this.database.memories.bulkAdd(structuredClone(history.memories));
        await this.database.aiRuns.add(structuredClone(aiRun));
      },
    );
  }

  private async page<T extends { id: string; worldId: string; residentId?: string; tick: number }>(
    table: Table<T, string>,
    query: PageQuery,
  ): Promise<T[]> {
    const values = await table.where('worldId').equals(query.worldId).toArray();
    return values
      .filter((item) => !query.residentId || item.residentId === query.residentId)
      .sort((left, right) => right.tick - left.tick || right.id.localeCompare(left.id))
      .slice(query.offset, query.offset + query.limit)
      .map((item) => structuredClone(item));
  }

  listLifeLogs(query: PageQuery): Promise<LifeLogRecord[]> {
    return this.page(this.database.lifeLogs, query);
  }

  listConversations(query: PageQuery): Promise<ConversationRecord[]> {
    return this.page(this.database.conversations, query);
  }

  listEvents(query: PageQuery): Promise<PersistentEventRecord[]> {
    return this.page(this.database.events, query);
  }

  async getStorageStats(worldId: string): Promise<Record<'lifeLogs' | 'conversations' | 'events' | 'knowledge' | 'memories' | 'aiRuns', number>> {
    const [lifeLogs, conversations, events, knowledge, memories, aiRuns] = await Promise.all([
      this.database.lifeLogs.where('worldId').equals(worldId).count(),
      this.database.conversations.where('worldId').equals(worldId).count(),
      this.database.events.where('worldId').equals(worldId).count(),
      this.database.knowledge.where('worldId').equals(worldId).count(),
      this.database.memories.where('worldId').equals(worldId).count(),
      this.database.aiRuns.where('worldId').equals(worldId).count(),
    ]);
    return { lifeLogs, conversations, events, knowledge, memories, aiRuns };
  }

  async deleteHistory(worldId: string): Promise<void> {
    await this.database.transaction(
      'rw',
      [
        this.database.lifeLogs,
        this.database.conversations,
        this.database.events,
        this.database.knowledge,
        this.database.memories,
        this.database.aiRuns,
      ],
      async () => {
        await Promise.all([
          this.database.lifeLogs.where('worldId').equals(worldId).delete(),
          this.database.conversations.where('worldId').equals(worldId).delete(),
          this.database.events.where('worldId').equals(worldId).delete(),
          this.database.knowledge.where('worldId').equals(worldId).delete(),
          this.database.memories.where('worldId').equals(worldId).delete(),
          this.database.aiRuns.where('worldId').equals(worldId).delete(),
        ]);
      },
    );
  }

  async hasSave(): Promise<boolean> {
    const [legacyCount, worldCount] = await Promise.all([
      this.database.saves.count(),
      this.database.worlds.count(),
    ]);
    return legacyCount > 0 || worldCount > 0;
  }

  async delete(): Promise<void> {
    await this.database.delete();
  }
}
