import { expect, test } from 'vitest';
import { applyCommand } from '../../src/sim/commands';
import { getPreset } from '../../src/sim/scenarios';
import { createWorld } from '../../src/sim/world';

test('applies an era preset without discarding residents, time or history', () => {
  const world = createWorld({ seed: 207, scenario: getPreset('stable-modern') });
  world.tick = 99;
  world.events.push({ id: 'event-old', tick: 98, type: 'system', title: '旧事件', detail: '', residentIds: [] });
  const residentIds = world.residents.map((resident) => resident.id);

  const result = applyCommand(world, { type: 'apply-scenario-preset', presetId: 'economic-downturn' });

  expect(result.ok).toBe(true);
  expect(world.residents.map((resident) => resident.id)).toEqual(residentIds);
  expect(world.tick).toBe(99);
  expect(world.events.some((event) => event.id === 'event-old')).toBe(true);
  expect(world.scenario.id).toBe('economic-downturn');
});

