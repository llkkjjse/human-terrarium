import { expect, test } from 'vitest';
import { getPreset } from '../../src/sim/scenarios';
import { createWorld, stepWorld } from '../../src/sim/world';

test('allows an adult newcomer to enter a healthy community after a death', () => {
  const world = createWorld({ seed: 150, scenario: getPreset('stable-modern') });
  world.residents[0].alive = false;
  world.tick = 31;

  stepWorld(world);

  expect(world.residents.filter((resident) => resident.alive)).toHaveLength(24);
  expect(world.events.at(-1)).toMatchObject({ type: 'migration', title: expect.stringContaining('迁入') });
});

