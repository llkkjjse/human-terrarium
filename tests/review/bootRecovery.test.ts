import { expect, test } from 'vitest';
import { resolveBootState, resolveV2BootState } from '../../src/persistence/boot';
import { createGeneratedWorld } from '../../src/sim/generation';
import { getPreset } from '../../src/sim/scenarios';
import { districts } from '../../src/sim/world';
import { createWorld } from '../../src/sim/world';

test('locks autosave and surfaces a notice when an existing save cannot be restored', async () => {
  const fallback = createWorld({ seed: 209, scenario: getPreset('stable-modern') });
  const result = await resolveBootState({
    hasSave: async () => true,
    load: async () => { throw new Error('disk unavailable'); },
  }, () => fallback, 5_000);

  expect(result.world).toBe(fallback);
  expect(result.canPersist).toBe(false);
  expect(result.notice).toContain('未覆盖');
});

test('opens society setup for a healthy empty v2 database', async () => {
  const result = await resolveV2BootState({
    hasSave: async () => false,
    loadV2: async () => { throw new Error('must not load'); },
  });

  expect(result).toEqual({ world: null, canPersist: true, notice: null });
});

test('restores exactly the last committed v2 frame without offline simulation', async () => {
  const scenario = getPreset('stable-modern');
  const saved = createGeneratedWorld({
    seed: 210,
    blueprint: {
      schemaVersion: 2,
      id: 'boot-v2',
      name: '启动社区',
      description: '保持最后提交帧。',
      sourceText: '启动社区',
      parameters: scenario.parameters,
      policies: [],
      districts: structuredClone(districts),
      social: { inequality: 40, mobility: 50, trust: 60, corruption: 10, crimePressure: 20, gossip: 40 },
    },
  });
  saved.tick = 12;
  saved.lastSavedAt = 1_000;

  const result = await resolveV2BootState({
    hasSave: async () => true,
    loadV2: async () => structuredClone(saved),
  });

  expect(result.world?.tick).toBe(12);
  expect(result.world?.lastSavedAt).toBe(1_000);
});

