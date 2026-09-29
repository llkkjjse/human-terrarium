import { expect, test, vi } from 'vitest';
import { advanceLegacyWorld } from '../../src/api/runtime';
import { getPreset } from '../../src/sim/scenarios';
import { createWorld } from '../../src/sim/world';

test('keeps fixed-tick advancement as an explicitly legacy migration helper', () => {
  const world = createWorld({ seed: 140, scenario: getPreset('stable-modern') });
  const listener = vi.fn();

  const snapshot = advanceLegacyWorld(world, 4, listener);

  expect(snapshot.tick).toBe(4);
  expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'tick', tick: 4 }));
});

