import { expect, test } from 'vitest';
import { applyCommand } from '../../src/sim/commands';
import { getPreset } from '../../src/sim/scenarios';
import { createWorld } from '../../src/sim/world';

test('turns an edited preset into a named custom era background', () => {
  const world = createWorld({ seed: 111, scenario: getPreset('stable-modern') });
  applyCommand(world, { type: 'update-era-parameter', path: 'technology.automation', value: 88 });
  applyCommand(world, { type: 'update-scenario-metadata', name: '潮汐城 2049', description: '高度自动化与传统社区生活并存的沿海城市。' });

  expect(world.scenario).toMatchObject({
    id: 'custom',
    baseline: 'custom',
    name: '潮汐城 2049',
    description: '高度自动化与传统社区生活并存的沿海城市。',
  });
});

