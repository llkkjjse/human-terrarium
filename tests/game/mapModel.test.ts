import { expect, test } from 'vitest';
import { buildMapModel } from '../../src/game/mapModel';
import { getPreset } from '../../src/sim/scenarios';
import { createWorld } from '../../src/sim/world';
import { createGeneratedWorld } from '../../src/sim/generation';
import { districts } from '../../src/sim/world';

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

test('derives v2 map cues only from visible wealth and low-profile appearance', () => {
  const scenario = getPreset('stable-modern');
  const world = createGeneratedWorld({
    seed: 321,
    blueprint: {
      schemaVersion: 2,
      id: 'map-v2',
      name: 'Map cues',
      description: 'Visible wealth test',
      sourceText: 'Visible wealth test',
      parameters: scenario.parameters,
      policies: [],
      districts: structuredClone(districts),
      social: { inequality: 60, mobility: 40, trust: 50, corruption: 10, crimePressure: 20, gossip: 50 },
    },
  });
  const resident = world.residents[0];
  resident.finances.cash = 99_000_000;
  resident.perceivedClass = 'precarious';
  resident.appearance.lowProfile = 100;
  for (const asset of world.assets.filter((item) => item.ownerId === resident.id)) asset.visibleValue = 0;

  const model = buildMapModel(world);
  const cue = model.residents.find((item) => item.id === resident.id)!;
  expect(cue.visibleClass).toBe('precarious');
  expect(cue.visibleWealth).toBe(0);
  expect(cue.hasVisibleHome).toBe(false);
  expect(cue.hasVisibleVehicle).toBe(false);
  expect(JSON.stringify(cue)).not.toContain('99000000');
});

