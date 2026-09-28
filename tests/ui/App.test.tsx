import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { createRuntime } from '../../src/api/runtime';
import { TerrariumApp } from '../../src/ui/App';
import { getPreset } from '../../src/sim/scenarios';
import { createWorld } from '../../src/sim/world';

describe('human terrarium interface', () => {
  test('shows the world, era controls, residents and observation timeline', () => {
    const runtime = createRuntime(createWorld({ seed: 2026, scenario: getPreset('stable-modern') }));
    render(<TerrariumApp runtime={runtime} renderMap={false} />);

    expect(screen.getByRole('heading', { name: '人间一隅' })).toBeInTheDocument();
    expect(screen.getByText('24 位居民')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '时代控制台' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '观察时间线' })).toBeInTheDocument();
    expect(screen.getByLabelText('经济景气')).toHaveValue('62');
  });

  test('changes era conditions and inspects an autonomous resident', async () => {
    const runtime = createRuntime(createWorld({ seed: 2027, scenario: getPreset('stable-modern') }));
    render(<TerrariumApp runtime={runtime} renderMap={false} />);
    fireEvent.change(screen.getByLabelText('经济景气'), { target: { value: '35' } });
    fireEvent.click(screen.getByRole('button', { name: /陈晨/ }));

    expect(runtime.getScenario().parameters.economy.prosperity).toBe(35);
    const inspector = screen.getByLabelText('居民档案');
    expect(within(inspector).getByRole('heading', { name: '陈晨' })).toBeInTheDocument();
    expect(within(inspector).getByText('性格轮廓')).toBeInTheDocument();
  });
});

