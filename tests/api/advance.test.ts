import { expect, test, vi } from 'vitest';
import { createRuntime } from '../../src/api/runtime';
import { getPreset } from '../../src/sim/scenarios';
import { createWorld } from '../../src/sim/world';

test('advances simulation through the runtime and publishes a tick summary', () => {
  const runtime = createRuntime(createWorld({ seed: 140, scenario: getPreset('stable-modern') }));
  const listener = vi.fn();
  runtime.subscribe('tick', listener);

  const snapshot = runtime.advance(4);

  expect(snapshot.tick).toBe(4);
  expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'tick', tick: 4 }));
});

