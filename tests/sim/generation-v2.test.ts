import { describe, expect, test } from 'vitest';
import { createGeneratedWorld, deriveSocialClass } from '../../src/sim/generation';
import { getPreset } from '../../src/sim/scenarios';
import { districts } from '../../src/sim/world';
import type { SocietyBlueprint } from '../../src/sim/types';

function blueprint(): SocietyBlueprint {
  const scenario = getPreset('stable-modern');
  return {
    schemaVersion: 2,
    id: 'blueprint-test',
    name: '测试社会',
    description: '贫富差距明显，但公共服务仍然运转。',
    sourceText: '这是一个阶层差距明显的城市社区。',
    parameters: scenario.parameters,
    policies: [],
    districts: structuredClone(districts),
    social: {
      inequality: 78,
      mobility: 35,
      trust: 52,
      corruption: 22,
      crimePressure: 38,
      gossip: 64,
    },
  };
}

describe('v2 society generation', () => {
  test('creates the same coherent 24 residents for the same seed', () => {
    const first = createGeneratedWorld({ seed: 20260929, blueprint: blueprint() });
    const second = createGeneratedWorld({ seed: 20260929, blueprint: blueprint() });

    expect(first).toEqual(second);
    expect(first.residents).toHaveLength(24);
    expect(new Set(first.residents.map((resident) => resident.id)).size).toBe(24);
    expect(new Set(first.residents.map((resident) => resident.role))).toEqual(
      new Set(['supply', 'commerce', 'care', 'maintenance', 'safety', 'culture']),
    );
  });

  test('keeps generated abilities natural and the player-only trait blank', () => {
    const world = createGeneratedWorld({ seed: 17, blueprint: blueprint() });

    for (const resident of world.residents) {
      expect(resident.customTrait).toBe('');
      expect(Object.keys(resident.abilities)).toEqual([
        'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
      ]);
      for (const ability of Object.values(resident.abilities)) {
        expect(Number.isInteger(ability)).toBe(true);
        expect(ability).toBeGreaterThanOrEqual(1);
        expect(ability).toBeLessThanOrEqual(20);
      }
      expect(resident.realClass).toMatch(/^(precarious|working|middle|affluent|elite)$/);
      expect(resident.perceivedClass).toMatch(/^(precarious|working|middle|affluent|elite)$/);
    }
  });

  test('creates only assets owned by existing residents and derives class from real finances', () => {
    const world = createGeneratedWorld({ seed: 82, blueprint: blueprint() });
    const residentIds = new Set(world.residents.map((resident) => resident.id));

    expect(world.assets.length).toBeGreaterThanOrEqual(24);
    expect(world.assets.every((asset) => residentIds.has(asset.ownerId))).toBe(true);
    expect(deriveSocialClass({
      cash: 0,
      income: 0,
      debt: 8_000,
      housingValue: 0,
      vehicleValue: 0,
      reputation: 20,
    })).toBe('precarious');
    expect(deriveSocialClass({
      cash: 900_000,
      income: 80_000,
      debt: 0,
      housingValue: 3_000_000,
      vehicleValue: 500_000,
      reputation: 80,
    })).toBe('elite');
  });
});
