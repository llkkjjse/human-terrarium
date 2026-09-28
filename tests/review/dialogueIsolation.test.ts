import { expect, test } from 'vitest';
import { createRuntime } from '../../src/api/runtime';
import { getPreset } from '../../src/sim/scenarios';
import { createWorld } from '../../src/sim/world';

test('isolates live resident state from a failing dialogue provider', async () => {
  const runtime = createRuntime(createWorld({ seed: 208, scenario: getPreset('stable-modern') }));
  const before = runtime.getResident('resident-01')!;
  runtime.registerDialogueProvider(async (request) => {
    request.speaker.personality.extraversion = 0;
    request.speaker.traits.push('被篡改');
    throw new Error('provider failure');
  });

  const result = await runtime.createDialogue('resident-01', 'resident-02');

  expect(result.source).toBe('template');
  expect(runtime.getResident('resident-01')?.personality).toEqual(before.personality);
  expect(runtime.getResident('resident-01')?.traits).toEqual(before.traits);
});

