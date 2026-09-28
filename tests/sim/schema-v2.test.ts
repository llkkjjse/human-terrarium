import { describe, expect, test } from 'vitest';
import { createGeneratedWorld } from '../../src/sim/generation';
import { worldStateV2Schema } from '../../src/sim/schema';
import { getPreset } from '../../src/sim/scenarios';
import { districts } from '../../src/sim/world';
import type { SocietyBlueprint, WorldStateV2 } from '../../src/sim/types';

function validWorld(): WorldStateV2 {
  const scenario = getPreset('stable-modern');
  const blueprint: SocietyBlueprint = {
    schemaVersion: 2,
    id: 'schema-world',
    name: '结构校验社会',
    description: '用于验证引用和玩家编辑值。',
    sourceText: '普通社区',
    parameters: scenario.parameters,
    policies: [],
    districts: structuredClone(districts),
    social: { inequality: 40, mobility: 55, trust: 60, corruption: 10, crimePressure: 20, gossip: 45 },
  };
  return createGeneratedWorld({ seed: 9, blueprint });
}

describe('worldStateV2Schema', () => {
  test('accepts a finite player-edited ability above twenty', () => {
    const world = validWorld();
    world.residents[0].abilities.strength = 27;

    expect(worldStateV2Schema.safeParse(world).success).toBe(true);
  });

  test('rejects a non-finite edited ability', () => {
    const world = validWorld();
    world.residents[0].abilities.strength = Number.POSITIVE_INFINITY;

    expect(worldStateV2Schema.safeParse(world).success).toBe(false);
  });

  test('rejects duplicate residents and assets with missing owners', () => {
    const duplicate = validWorld();
    duplicate.residents[1].id = duplicate.residents[0].id;
    expect(worldStateV2Schema.safeParse(duplicate).success).toBe(false);

    const orphan = validWorld();
    orphan.assets[0].ownerId = 'resident-does-not-exist';
    expect(worldStateV2Schema.safeParse(orphan).success).toBe(false);
  });
});
