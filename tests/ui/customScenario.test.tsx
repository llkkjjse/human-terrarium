import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { createRuntime } from '../../src/api/runtime';
import { getPreset } from '../../src/sim/scenarios';
import { createWorld } from '../../src/sim/world';
import { TerrariumApp } from '../../src/ui/App';

test('lets the era director name and describe a customized world', () => {
  const runtime = createRuntime(createWorld({ seed: 112, scenario: getPreset('stable-modern') }));
  render(<TerrariumApp runtime={runtime} renderMap={false} />);
  fireEvent.change(screen.getByLabelText('经济景气'), { target: { value: '44' } });
  fireEvent.change(screen.getByLabelText('自定义时代名称'), { target: { value: '缓慢复苏期' } });

  expect(runtime.getScenario().id).toBe('custom');
  expect(runtime.getScenario().name).toBe('缓慢复苏期');
});

