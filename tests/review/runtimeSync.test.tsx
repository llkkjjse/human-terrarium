import { act, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { createRuntime } from '../../src/api/runtime';
import { getPreset } from '../../src/sim/scenarios';
import { createWorld } from '../../src/sim/world';
import { TerrariumApp } from '../../src/ui/App';

test('reflects external SDK commands in the paused UI', async () => {
  const runtime = createRuntime(createWorld({ seed: 206, scenario: getPreset('stable-modern') }));
  await runtime.dispatch({ type: 'set-time-scale', value: 0 });
  render(<TerrariumApp runtime={runtime} renderMap={false} />);

  await act(async () => {
    await runtime.dispatch({ type: 'update-era-parameter', path: 'economy.prosperity', value: 10 });
    await runtime.dispatch({ type: 'set-time-scale', value: 1 });
  });

  expect(screen.getByLabelText('经济景气')).toHaveValue('10');
  expect(screen.getByRole('button', { name: '1×' })).toHaveClass('active');
});

