import { describe, expect, test, vi } from 'vitest';
import type { AiClient, AiResult } from '../../src/ai/client';
import type { FrameResponse } from '../../src/ai/contracts';
import { FrameController } from '../../src/api/frame-controller';
import type { AiRunRecord, HistoryBatch } from '../../src/persistence/database';
import type { WorldStateV2 } from '../../src/sim/types';
import { frameResponse, resolverWorld } from '../sim/resolver-fixture';

function aiClient(runFrame: AiClient['runFrame']): AiClient {
  return {
    runFrame,
    generateWorld: vi.fn(),
    compilePolicy: vi.fn(),
    parseAbsoluteEvent: vi.fn(),
  };
}

function result(world: WorldStateV2, overrides = {}): AiResult<FrameResponse> {
  return {
    data: frameResponse(world, overrides),
    usage: {
      model: 'deepseek-flash',
      inputTokens: 100,
      outputTokens: 50,
      durationMs: 20,
      estimatedCost: 0.001,
    },
  };
}

describe('transactional frame controller', () => {
  test('prepares queued changes, calls AI once, commits, then publishes', async () => {
    const world = resolverWorld();
    const residentId = world.residents[0].id;
    world.selectedResidentId = residentId;
    world.queuedChanges = [
      {
        id: 'forced-health',
        type: 'absolute-event',
        originalText: 'The resident collapses.',
        payload: { residentId, set: { 'needs.health': 9 } },
      },
      {
        id: 'policy-change',
        type: 'policy',
        originalText: 'Introduce emergency care.',
        payload: {
          policy: {
            id: 'emergency-care',
            name: 'Emergency care',
            description: 'Provide urgent treatment.',
            enabled: true,
            intensity: 80,
            modifiers: [],
          },
        },
      },
    ];
    const order: string[] = [];
    const runFrame = vi.fn<AiClient['runFrame']>(async (request) => {
      order.push('ai');
      expect(request.selectedResidentDetail?.needs.health).toBe(9);
      expect(request.society.policies.some((policy) => policy.id === 'emergency-care')).toBe(true);
      expect(request.absoluteEvents.map((event) => event.id)).toContain('forced-health');
      return result(world);
    });
    const commitFrame = vi.fn(async (_next: WorldStateV2, _history: HistoryBatch, _run: AiRunRecord) => {
      order.push('commit');
    });
    const controller = new FrameController(world, { aiClient: aiClient(runFrame), frameStore: { commitFrame } });
    controller.subscribeState(() => order.push('publish'));

    const outcome = await controller.runFrame('1h', residentId);

    expect(outcome.ok).toBe(true);
    expect(runFrame).toHaveBeenCalledOnce();
    expect(commitFrame).toHaveBeenCalledOnce();
    expect(order).toEqual(['ai', 'commit', 'publish']);
    expect(controller.getWorldSnapshot().tick).toBe(world.tick + 1);
  });

  test('rejects invalid references without advancing or persisting', async () => {
    const world = resolverWorld();
    const invalid = result(world);
    invalid.data.residentActions[0] = {
      ...invalid.data.residentActions[0],
      action: 'attempt_fraud',
      targetId: 'missing-resident',
    };
    const commitFrame = vi.fn();
    const controller = new FrameController(world, {
      aiClient: aiClient(vi.fn(async () => invalid)),
      frameStore: { commitFrame },
    });

    const outcome = await controller.runFrame('12h');

    expect(outcome.ok).toBe(false);
    expect(controller.getWorldSnapshot()).toEqual(world);
    expect(commitFrame).not.toHaveBeenCalled();
    expect(controller.getStatus().phase).toBe('error');
  });

  test('shares one in-flight promise and aborts before commit', async () => {
    const world = resolverWorld();
    let release!: (value: AiResult<FrameResponse>) => void;
    const pending = new Promise<AiResult<FrameResponse>>((resolve) => { release = resolve; });
    const commitFrame = vi.fn();
    const controller = new FrameController(world, {
      aiClient: aiClient(vi.fn(() => pending)),
      frameStore: { commitFrame },
    });

    const first = controller.runFrame('1d');
    const second = controller.runFrame('1d');
    expect(second).toBe(first);
    controller.abortCurrentFrame();
    release(result(world));
    const outcome = await first;

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.cancelled).toBe(true);
    expect(commitFrame).not.toHaveBeenCalled();
    expect(controller.getWorldSnapshot()).toEqual(world);
  });

  test('preserves interventions committed while the current AI request is in flight', async () => {
    const world = resolverWorld();
    let release!: (value: AiResult<FrameResponse>) => void;
    const pending = new Promise<AiResult<FrameResponse>>((resolve) => { release = resolve; });
    const commitFrame = vi.fn(async () => undefined);
    const controller = new FrameController(world, {
      aiClient: aiClient(vi.fn(() => pending)),
      frameStore: { commitFrame },
    });

    const running = controller.runFrame('1h');
    const edited = controller.getWorldSnapshot();
    edited.queuedChanges.push({
      id: 'next-frame-goal',
      type: 'resident-edit',
      residentId: edited.residents[0].id,
      payload: { playerGoal: 'Buy a home.' },
    });
    controller.replaceWorld(edited);
    release(result(world));
    expect((await running).ok).toBe(true);

    expect(controller.getWorldSnapshot().queuedChanges).toEqual([
      expect.objectContaining({ id: 'next-frame-goal' }),
    ]);
    expect(commitFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        queuedChanges: [expect.objectContaining({ id: 'next-frame-goal' })],
      }),
      expect.anything(),
      expect.anything(),
    );
  });

  test('repairs only trait-priority violations once and rejects a failed repair', async () => {
    const world = resolverWorld();
    world.residents[0].customTrait = 'Never steals.';
    world.residents[0].playerGoal = 'Get rich.';
    const invalid = result(world, {
      [world.residents[0].id]: {
        action: 'attempt_robbery',
        targetId: world.residents[1].id,
        priorityBasis: 'player-goal',
      },
    });
    const repaired = result(world, {
      [world.residents[0].id]: {
        action: 'work',
        priorityBasis: 'custom-trait',
      },
    });
    const runFrame = vi.fn()
      .mockResolvedValueOnce(invalid)
      .mockResolvedValueOnce(repaired);
    const commitFrame = vi.fn(async () => undefined);
    const controller = new FrameController(world, {
      aiClient: aiClient(runFrame),
      frameStore: { commitFrame },
    });

    expect((await controller.runFrame('1h')).ok).toBe(true);
    expect(runFrame).toHaveBeenCalledTimes(2);
    expect(commitFrame).toHaveBeenCalledOnce();

    const failedRun = vi.fn().mockResolvedValue(invalid);
    const failedController = new FrameController(world, {
      aiClient: aiClient(failedRun),
      frameStore: { commitFrame: vi.fn() },
    });
    expect((await failedController.runFrame('1h')).ok).toBe(false);
    expect(failedRun).toHaveBeenCalledTimes(2);
  });
});
