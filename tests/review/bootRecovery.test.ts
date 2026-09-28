import { expect, test } from 'vitest';
import { resolveBootState } from '../../src/persistence/boot';
import { getPreset } from '../../src/sim/scenarios';
import { createWorld } from '../../src/sim/world';

test('locks autosave and surfaces a notice when an existing save cannot be restored', async () => {
  const fallback = createWorld({ seed: 209, scenario: getPreset('stable-modern') });
  const result = await resolveBootState({
    hasSave: async () => true,
    load: async () => { throw new Error('disk unavailable'); },
  }, () => fallback, 5_000);

  expect(result.world).toBe(fallback);
  expect(result.canPersist).toBe(false);
  expect(result.notice).toContain('未覆盖');
});

