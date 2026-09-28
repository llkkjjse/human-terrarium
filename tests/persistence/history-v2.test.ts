import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, describe, expect, test } from 'vitest';
import { SaveDatabase, type AiRunRecord, type HistoryBatch } from '../../src/persistence/database';
import { createGeneratedWorld } from '../../src/sim/generation';
import { getPreset } from '../../src/sim/scenarios';
import { districts } from '../../src/sim/world';
import type { SocietyBlueprint, WorldStateV2 } from '../../src/sim/types';

function world(seed = 601): WorldStateV2 {
  const scenario = getPreset('stable-modern');
  const blueprint: SocietyBlueprint = {
    schemaVersion: 2,
    id: `world-${seed}`,
    name: '持久历史社区',
    description: '验证永久历史。',
    sourceText: '稳定社会',
    parameters: scenario.parameters,
    policies: [],
    districts: structuredClone(districts),
    social: { inequality: 45, mobility: 50, trust: 60, corruption: 10, crimePressure: 20, gossip: 45 },
  };
  return createGeneratedWorld({ seed, blueprint });
}

function batch(worldId: string, logIds: string[]): HistoryBatch {
  return {
    lifeLogs: logIds.map((id, index) => ({
      id,
      worldId,
      residentId: 'resident-01',
      tick: index + 1,
      kind: 'routine',
      summary: id,
      detail: `detail-${id}`,
    })),
    conversations: [{
      id: `conversation-${logIds[0]}`,
      worldId,
      tick: 1,
      participantIds: ['resident-01', 'resident-02'],
      locationId: 'commons',
      text: '完整对话内容',
    }],
    events: [],
    knowledge: [],
    memories: [],
  };
}

function aiRun(worldId: string): AiRunRecord {
  return {
    id: `ai-${worldId}`,
    worldId,
    frameStartTick: 0,
    status: 'success',
    durationMs: 120,
    inputTokens: 500,
    outputTokens: 200,
    estimatedCost: 0.002,
  };
}

describe('append-only v2 history', () => {
  const databases: SaveDatabase[] = [];
  afterEach(async () => Promise.all(databases.map((database) => database.delete())));

  test('commits the world and every history category in one transaction', async () => {
    const database = new SaveDatabase(`history-${Math.random()}`, { indexedDB, IDBKeyRange });
    databases.push(database);
    const current = world();
    const history = batch(current.blueprint.id, ['log-1']);
    history.events.push({
      id: 'event-persisted',
      worldId: current.blueprint.id,
      tick: 1,
      type: 'health',
      title: '生病',
      detail: '需要休息',
      residentIds: ['resident-01'],
    });
    history.knowledge.push({
      id: 'knowledge-1',
      worldId: current.blueprint.id,
      residentId: 'resident-01',
      subjectId: 'resident-02',
      topic: 'wealth',
      claim: '听说对方有钱',
      source: 'conversation',
      confidence: 40,
      lastUpdatedTick: 1,
      rumor: true,
    });
    history.memories.push({
      id: 'memory-1',
      worldId: current.blueprint.id,
      residentId: 'resident-01',
      tick: 1,
      text: '记住了一段传闻',
      summary: false,
    });

    await database.commitFrame(current, history, aiRun(current.blueprint.id));

    expect((await database.loadV2()).seed).toBe(601);
    expect(await database.listLifeLogs({ worldId: current.blueprint.id, limit: 10, offset: 0 })).toHaveLength(1);
    expect(await database.listConversations({ worldId: current.blueprint.id, limit: 10, offset: 0 })).toHaveLength(1);
    expect(await database.listEvents({ worldId: current.blueprint.id, limit: 10, offset: 0 })).toHaveLength(1);
    expect(await database.getStorageStats(current.blueprint.id)).toMatchObject({
      lifeLogs: 1,
      conversations: 1,
      events: 1,
      knowledge: 1,
      memories: 1,
      aiRuns: 1,
    });
  });

  test('rolls back an invalid frame and keeps the previous committed world', async () => {
    const database = new SaveDatabase(`atomic-${Math.random()}`, { indexedDB, IDBKeyRange });
    databases.push(database);
    const current = world(602);
    await database.commitFrame(current, batch(current.blueprint.id, ['good-log']), aiRun(current.blueprint.id));
    const invalid = structuredClone(current);
    invalid.tick = 99;
    invalid.assets[0].ownerId = 'missing-owner';

    await expect(database.commitFrame(invalid, batch(current.blueprint.id, ['bad-log']), {
      ...aiRun(current.blueprint.id),
      id: 'bad-run',
    })).rejects.toThrow();

    expect((await database.loadV2()).tick).toBe(0);
    expect((await database.listLifeLogs({ worldId: current.blueprint.id, limit: 10, offset: 0 })).map((item) => item.id)).toEqual(['good-log']);
  });

  test('paginates old logs and never removes them automatically', async () => {
    const database = new SaveDatabase(`paging-${Math.random()}`, { indexedDB, IDBKeyRange });
    databases.push(database);
    const current = world(603);
    const ids = Array.from({ length: 250 }, (_, index) => `log-${String(index + 1).padStart(3, '0')}`);
    await database.commitFrame(current, batch(current.blueprint.id, ids), aiRun(current.blueprint.id));

    const first = await database.listLifeLogs({ worldId: current.blueprint.id, limit: 2, offset: 0 });
    const older = await database.listLifeLogs({ worldId: current.blueprint.id, limit: 1, offset: 249 });

    expect(first.map((item) => item.id)).toEqual(['log-250', 'log-249']);
    expect(older.map((item) => item.id)).toEqual(['log-001']);
    expect((await database.getStorageStats(current.blueprint.id)).lifeLogs).toBe(250);
  });
});
