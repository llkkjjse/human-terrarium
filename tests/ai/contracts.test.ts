import { describe, expect, test } from 'vitest';
import { frameResponseSchema, validateFrameResponse, type FrameResponse } from '../../src/ai/contracts';
import { createGeneratedWorld } from '../../src/sim/generation';
import { getPreset } from '../../src/sim/scenarios';
import { districts } from '../../src/sim/world';

function world() {
  const scenario = getPreset('stable-modern');
  return createGeneratedWorld({
    seed: 701,
    blueprint: {
      schemaVersion: 2,
      id: 'ai-contract-world',
      name: '协议社区',
      description: '测试 AI 协议。',
      sourceText: '稳定社区',
      parameters: scenario.parameters,
      policies: [],
      districts: structuredClone(districts),
      social: { inequality: 45, mobility: 50, trust: 60, corruption: 10, crimePressure: 20, gossip: 45 },
    },
  });
}

function response(): FrameResponse {
  return {
    residentActions: Array.from({ length: 24 }, (_, index) => ({
      residentId: `resident-${String(index + 1).padStart(2, '0')}`,
      action: 'continue' as const,
      reason: '继续当前安排',
      planChange: '',
      priorityBasis: 'routine' as const,
      dialogue: [],
    })),
    conversations: [],
    candidateEvents: [],
    memoryUpdates: [],
  };
}

describe('AI frame response contract', () => {
  test('requires one unique action for every resident', () => {
    expect(frameResponseSchema.safeParse(response()).success).toBe(true);

    const missing = response();
    missing.residentActions.pop();
    expect(frameResponseSchema.safeParse(missing).success).toBe(false);

    const duplicate = response();
    duplicate.residentActions[23].residentId = duplicate.residentActions[0].residentId;
    expect(frameResponseSchema.safeParse(duplicate).success).toBe(false);
  });

  test('rejects nonexistent references and direct settled outcomes', () => {
    const invalidReference = response();
    invalidReference.residentActions[0] = {
      ...invalidReference.residentActions[0],
      action: 'attempt_fraud',
      targetId: 'resident-missing',
      locationId: 'commerce',
    };
    expect(() => validateFrameResponse(invalidReference, world())).toThrow('引用');

    const settled = response() as unknown as { residentActions: Array<Record<string, unknown>> };
    settled.residentActions[0].action = 'transfer_money';
    expect(frameResponseSchema.safeParse(settled).success).toBe(false);
  });

  test('rejects duplicate conversations and contact that cannot occur', () => {
    const current = world();
    current.residents[0].districtId = 'residential';
    current.residents[1].districtId = 'commerce';
    const impossible = response();
    impossible.conversations = [{
      id: 'conversation-1',
      participantIds: ['resident-01', 'resident-02'],
      locationId: 'residential',
      lines: [
        { speakerId: 'resident-01', text: '你听说了吗？' },
        { speakerId: 'resident-02', text: '没有。' },
      ],
    }];
    expect(() => validateFrameResponse(impossible, current)).toThrow('接触');

    current.residents[1].districtId = 'residential';
    const duplicate = structuredClone(impossible);
    duplicate.conversations.push(structuredClone(duplicate.conversations[0]));
    expect(frameResponseSchema.safeParse(duplicate).success).toBe(false);
  });

  test('requires custom trait to be the declared priority basis', () => {
    const current = world();
    current.residents[0].customTrait = '绝不欺骗任何人';
    current.residents[0].playerGoal = '今天赚到一大笔钱';
    const invalid = response();
    invalid.residentActions[0].priorityBasis = 'player-goal';

    expect(() => validateFrameResponse(invalid, current)).toThrow('特性');

    invalid.residentActions[0].priorityBasis = 'custom-trait';
    expect(validateFrameResponse(invalid, current).residentActions).toHaveLength(24);
  });
});
