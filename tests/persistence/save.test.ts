import { describe, expect, test } from 'vitest';
import { applyOfflineProgress, createSave, parseSave } from '../../src/persistence/save';
import { getPreset } from '../../src/sim/scenarios';
import { createWorld } from '../../src/sim/world';

describe('save and offline progress', () => {
  test('round-trips a versioned world save', () => {
    const world = createWorld({ seed: 88, scenario: getPreset('automated-future') });
    const envelope = createSave(world, 1_000);
    const restored = parseSave(JSON.stringify(envelope));

    expect(restored).toEqual(world);
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.checksum).toMatch(/^[a-f0-9]{8}$/);
  });

  test('rejects a save whose payload was changed', () => {
    const world = createWorld({ seed: 89, scenario: getPreset('stable-modern') });
    const envelope = createSave(world, 1_000);
    envelope.payload.day = 999;

    expect(() => parseSave(envelope)).toThrow('存档校验失败');
  });

  test('caps offline simulation at seven real days', () => {
    const world = createWorld({ seed: 90, scenario: getPreset('stable-modern') });
    world.lastSavedAt = 0;

    const result = applyOfflineProgress(world, 30 * 24 * 60 * 60 * 1_000);

    expect(result.ticksApplied).toBe(672);
    expect(result.capped).toBe(true);
    expect(result.world.tick).toBe(672);
  });
});

