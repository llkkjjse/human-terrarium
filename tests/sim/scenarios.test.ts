import { describe, expect, test } from 'vitest';
import { getPreset, listPresets, scenarioSchema } from '../../src/sim/scenarios';

describe('era scenarios', () => {
  test('provides the four approved presets', () => {
    expect(listPresets().map((preset) => preset.id)).toEqual([
      'stable-modern',
      'economic-downturn',
      'industrial-upgrade',
      'automated-future',
    ]);
  });

  test('rejects a scenario parameter outside 0 to 100', () => {
    const scenario = getPreset('stable-modern');
    const result = scenarioSchema.safeParse({
      ...scenario,
      parameters: {
        ...scenario.parameters,
        economy: { ...scenario.parameters.economy, prosperity: 101 },
      },
    });

    expect(result.success).toBe(false);
  });
});

