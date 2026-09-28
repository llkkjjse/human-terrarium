import { describe, expect, test, vi } from 'vitest';
import { createRuntime } from '../../src/api/runtime';
import { getPreset } from '../../src/sim/scenarios';
import { createWorld } from '../../src/sim/world';

describe('browser runtime API', () => {
  test('returns detached snapshots and publishes command events', async () => {
    const runtime = createRuntime(createWorld({ seed: 21, scenario: getPreset('stable-modern') }));
    const listener = vi.fn();
    const unsubscribe = runtime.subscribe('economy', listener);
    const snapshot = runtime.getWorldSnapshot();
    snapshot.residents[0].name = '被外部修改';

    await runtime.dispatch({ type: 'update-era-parameter', path: 'economy.wages', value: 73 });

    expect(runtime.getResident('resident-01')?.name).not.toBe('被外部修改');
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  test('falls back to local dialogue when an AI provider fails', async () => {
    const runtime = createRuntime(createWorld({ seed: 22, scenario: getPreset('stable-modern') }));
    runtime.registerDialogueProvider(async () => {
      throw new Error('offline');
    });

    const line = await runtime.createDialogue('resident-01', 'resident-02');

    expect(line.source).toBe('template');
    expect(line.text.length).toBeGreaterThan(2);
  });
});

