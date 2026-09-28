import { expect, test } from 'vitest';
import { createRuntime } from '../../src/api/runtime';
import { getPreset } from '../../src/sim/scenarios';
import { createWorld } from '../../src/sim/world';

test('runtime exports and restores a world through the public API', async () => {
  const runtime = createRuntime(createWorld({ seed: 23, scenario: getPreset('stable-modern') }));
  const saved = await runtime.exportSave();
  await runtime.dispatch({ type: 'update-era-parameter', path: 'economy.prices', value: 99 });

  const result = await runtime.importSave(saved);

  expect(result.ok).toBe(true);
  expect(runtime.getScenario().parameters.economy.prices).toBe(50);
});

