import { describe, expect, test } from 'vitest';
import { applyCommand } from '../../src/sim/commands';
import { getPreset } from '../../src/sim/scenarios';
import { createWorld } from '../../src/sim/world';

describe('era director commands', () => {
  test('updates an era parameter and emits a traceable causal event', () => {
    const world = createWorld({ seed: 13, scenario: getPreset('stable-modern') });
    const result = applyCommand(world, {
      type: 'update-era-parameter',
      path: 'economy.prosperity',
      value: 35,
    });

    expect(result.ok).toBe(true);
    expect(world.scenario.parameters.economy.prosperity).toBe(35);
    expect(world.events.at(-1)).toMatchObject({ type: 'economy', causalId: expect.stringMatching(/^cause-/) });
  });

  test('activates a named policy without directly mutating a resident', () => {
    const world = createWorld({ seed: 14, scenario: getPreset('stable-modern') });
    const before = structuredClone(world.residents[0]);
    const result = applyCommand(world, {
      type: 'upsert-policy',
      policy: {
        id: 'rent-relief',
        name: '青年租住支持',
        description: '降低住房压力，改善青年可支配收入。',
        enabled: true,
        intensity: 70,
        modifiers: [{ path: 'economy.housingPressure', delta: -18 }],
      },
    });

    expect(result.ok).toBe(true);
    expect(world.scenario.policies).toHaveLength(1);
    expect(world.residents[0]).toEqual(before);
  });

  test('rejects invalid external commands with a stable error code', () => {
    const world = createWorld({ seed: 15, scenario: getPreset('stable-modern') });
    const result = applyCommand(world, {
      type: 'update-era-parameter',
      path: 'economy.prosperity',
      value: 400,
    });

    expect(result).toEqual({ ok: false, code: 'INVALID_COMMAND', message: expect.any(String) });
  });
});

