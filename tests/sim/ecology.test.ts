import { describe, expect, test } from 'vitest';
import { applyCommand } from '../../src/sim/commands';
import { getPreset } from '../../src/sim/scenarios';
import { createWorld, stepWorld } from '../../src/sim/world';

describe('social and survival simulation', () => {
  test('propagates an enabled policy into community metrics over time', () => {
    const world = createWorld({ seed: 101, scenario: getPreset('stable-modern') });
    const before = world.metrics.equality;
    applyCommand(world, {
      type: 'upsert-policy',
      policy: { id: 'welfare-plus', name: '社区保障扩容', description: '', enabled: true, intensity: 100, modifiers: [{ path: 'institutions.welfare', delta: 35 }] },
    });

    for (let index = 0; index < 16; index += 1) stepWorld(world);

    expect(world.metrics.equality).toBeGreaterThan(before);
  });

  test('applies and expires a targeted opportunity', () => {
    const world = createWorld({ seed: 102, scenario: getPreset('stable-modern') });
    const resident = world.residents.find((candidate) => candidate.role === 'care')!;
    const savings = resident.savings;
    applyCommand(world, { type: 'create-opportunity', opportunity: { name: '护理培训名额', target: 'care', durationTicks: 4, prosperityBoost: 20 } });

    for (let index = 0; index < 4; index += 1) stepWorld(world);

    expect(resident.savings).toBeGreaterThan(savings);
    expect(world.scenario.opportunities).toHaveLength(0);
    expect(world.events.some((event) => event.title === '机遇窗口结束')).toBe(true);
  });

  test('creates autonomous conversations that affect relationships', () => {
    const world = createWorld({ seed: 103, scenario: getPreset('stable-modern') });
    const [first, second] = world.residents;
    first.districtId = 'commons';
    second.districtId = 'commons';
    first.personality.extraversion = 100;
    second.personality.extraversion = 100;
    first.needs.social = 1;
    second.needs.social = 1;

    for (let index = 0; index < 32; index += 1) stepWorld(world);

    expect(world.events.some((event) => event.type === 'dialogue')).toBe(true);
    expect(first.relationships[second.id]).toBeGreaterThan(0);
  });

  test('records death when critical health and hunger can no longer recover', () => {
    const world = createWorld({ seed: 104, scenario: getPreset('economic-downturn') });
    const resident = world.residents[0];
    resident.needs.health = 0;
    resident.needs.hunger = 0;
    resident.needs.energy = 0;

    stepWorld(world);

    expect(resident.alive).toBe(false);
    expect(world.events.at(-1)).toMatchObject({ type: 'death', residentIds: [resident.id] });
  });
});

