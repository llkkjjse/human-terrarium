import { describe, expect, test } from 'vitest';
import { buildFrameRequest } from '../../src/ai/context';
import { createGeneratedWorld } from '../../src/sim/generation';
import { getPreset } from '../../src/sim/scenarios';
import { districts } from '../../src/sim/world';

function world() {
  const scenario = getPreset('stable-modern');
  const current = createGeneratedWorld({
    seed: 702,
    blueprint: {
      schemaVersion: 2,
      id: 'context-world',
      name: '上下文社区',
      description: '验证上下文边界。',
      sourceText: '阶层差异明显',
      parameters: scenario.parameters,
      policies: [],
      districts: structuredClone(districts),
      social: { inequality: 75, mobility: 30, trust: 50, corruption: 20, crimePressure: 35, gossip: 70 },
    },
  });
  current.residents[0].customTrait = '无论目标是什么，都不会伤害儿童';
  current.residents[0].playerGoal = '尽快买房';
  current.residents[0].memories = Array.from({ length: 20 }, (_, index) => ({
    id: `memory-${index}`,
    text: `旧记忆 ${index}`,
    tone: 'neutral' as const,
    tick: index,
  }));
  current.knowledge = Array.from({ length: 10 }, (_, index) => ({
    id: `knowledge-${index}`,
    residentId: 'resident-01',
    subjectId: 'resident-02',
    topic: 'wealth' as const,
    claim: `财富传闻 ${index}`,
    source: 'conversation' as const,
    confidence: 30 + index,
    lastUpdatedTick: index,
    rumor: true,
  }));
  current.residents[0].knowledgeIds = current.knowledge.map((item) => item.id);
  return current;
}

describe('bounded frame context', () => {
  test('preserves the raw custom trait and gives the selected resident more detail', () => {
    const request = buildFrameRequest(world(), '1h', 'resident-01');
    const compact = request.residents.find((resident) => resident.id === 'resident-01');

    expect(compact?.customTrait).toBe('无论目标是什么，都不会伤害儿童');
    expect(compact?.playerGoal).toBe('尽快买房');
    expect(request.selectedResidentDetail?.residentId).toBe('resident-01');
    expect(request.selectedResidentDetail?.needs).toBeDefined();
    expect(request.selectedResidentDetail?.visibleAssets.length).toBeGreaterThan(0);
  });

  test('bounds memories and knowledge while excluding render coordinates and full history', () => {
    const request = buildFrameRequest(world(), '12h', 'resident-01');
    const compact = request.residents[0];

    expect(compact.recentMemories).toHaveLength(3);
    expect(compact.relevantKnowledge).toHaveLength(5);
    expect(compact).not.toHaveProperty('x');
    expect(compact).not.toHaveProperty('y');
    expect(compact).not.toHaveProperty('memories');
    expect(request).not.toHaveProperty('events');
  });

  test('keeps stable resident ordering and includes every resident', () => {
    const request = buildFrameRequest(world(), '1d', null);

    expect(request.residents).toHaveLength(24);
    expect(request.residents.map((resident) => resident.id)).toEqual(
      Array.from({ length: 24 }, (_, index) => `resident-${String(index + 1).padStart(2, '0')}`),
    );
    expect(request.granularity).toBe('1d');
  });
});
