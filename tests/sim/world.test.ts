import { describe, expect, test } from 'vitest';
import { createWorld, stepWorld } from '../../src/sim/world';
import { getPreset } from '../../src/sim/scenarios';

describe('human terrarium world', () => {
  test('creates the four-district contemporary community with 24 residents', () => {
    const world = createWorld({ seed: 20260928, scenario: getPreset('stable-modern') });

    expect(world.districts.map((district) => district.id)).toEqual([
      'residential',
      'commerce',
      'commons',
      'municipal',
    ]);
    expect(world.residents).toHaveLength(24);
    expect(new Set(world.residents.map((resident) => resident.role)).size).toBe(6);
    expect(world.metrics).toEqual({
      vitality: 68,
      health: 76,
      trust: 62,
      mobility: 56,
      equality: 58,
      safety: 78,
    });
  });

  test('produces the same state for the same seed and steps', () => {
    const scenario = getPreset('industrial-upgrade');
    const first = createWorld({ seed: 42, scenario });
    const second = createWorld({ seed: 42, scenario });

    for (let index = 0; index < 48; index += 1) {
      stepWorld(first);
      stepWorld(second);
    }

    expect(first).toEqual(second);
    expect(first.tick).toBe(48);
  });

  test('personality changes chosen behavior under otherwise equal needs', () => {
    const world = createWorld({ seed: 7, scenario: getPreset('stable-modern') });
    const social = world.residents[0];
    const focused = world.residents[1];
    social.needs = { ...social.needs, social: 12, purpose: 55 };
    focused.needs = { ...focused.needs, social: 12, purpose: 55 };
    social.personality = { ...social.personality, extraversion: 95, diligence: 20 };
    focused.personality = { ...focused.personality, extraversion: 10, diligence: 95 };

    stepWorld(world);

    expect(social.activity).toBe('socialize');
    expect(focused.activity).toBe('work');
  });
});

