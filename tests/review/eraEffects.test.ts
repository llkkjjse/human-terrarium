import { expect, test } from 'vitest';
import { getPreset } from '../../src/sim/scenarios';
import { createWorld, stepWorld } from '../../src/sim/world';

test('different eras propagate into different resident lives', () => {
  const stable = createWorld({ seed: 42, scenario: getPreset('stable-modern') });
  const downturn = createWorld({ seed: 42, scenario: getPreset('economic-downturn') });

  for (let index = 0; index < 672; index += 1) {
    stepWorld(stable);
    stepWorld(downturn);
  }

  expect(stable.residents).not.toEqual(downturn.residents);
  expect(stable.residents.map(({ income, employed }) => ({ income, employed })))
    .not.toEqual(downturn.residents.map(({ income, employed }) => ({ income, employed })));
});

