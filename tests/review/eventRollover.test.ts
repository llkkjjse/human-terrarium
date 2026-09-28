import { expect, test, vi } from 'vitest';
import { createRuntime } from '../../src/api/runtime';
import { getPreset } from '../../src/sim/scenarios';
import { createWorld } from '../../src/sim/world';

test('keeps delivering uniquely identified events after history rollover', async () => {
  const runtime = createRuntime(createWorld({ seed: 205, scenario: getPreset('stable-modern') }));
  const listener = vi.fn();
  runtime.subscribe('economy', listener);

  for (let index = 0; index < 300; index += 1) {
    await runtime.dispatch({ type: 'update-era-parameter', path: 'economy.prosperity', value: index % 101 });
  }

  const events = runtime.getWorldSnapshot().events;
  expect(listener).toHaveBeenCalledTimes(300);
  expect(events).toHaveLength(240);
  expect(new Set(events.map((event) => event.id)).size).toBe(240);
  expect(new Set(events.map((event) => event.causalId)).size).toBe(240);
});

