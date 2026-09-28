import { expect, test } from 'vitest';
import { buildMapModel } from '../../src/game/mapModel';
import { getPreset } from '../../src/sim/scenarios';
import { createWorld } from '../../src/sim/world';

test('builds a deterministic four-district visual model with every resident', () => {
  const world = createWorld({ seed: 123, scenario: getPreset('stable-modern') });
  const first = buildMapModel(world);
  const second = buildMapModel(world);

  expect(first).toEqual(second);
  expect(first.districts).toHaveLength(4);
  expect(first.buildings.length).toBeGreaterThanOrEqual(20);
  expect(first.residents).toHaveLength(24);
  expect(first.residents.map((resident) => resident.id)).toEqual(world.residents.map((resident) => resident.id));
});

