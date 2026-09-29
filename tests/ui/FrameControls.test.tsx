import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { AiFrameStatus, FrameRunResult } from '../../src/api/frame-controller';
import { FrameControls } from '../../src/ui/FrameControls';

function runtime(runFrame: (granularity: '1h' | '12h' | '1d') => Promise<FrameRunResult>) {
  const status: AiFrameStatus = { phase: 'idle', cancelAfterCurrent: false };
  return {
    runFrame: vi.fn(runFrame),
    retryFrame: vi.fn(async () => ({ ok: false as const, error: 'retry failed' })),
    cancelAfterCurrentFrame: vi.fn(),
    getAiFrameStatus: vi.fn(() => status),
    subscribeAiFrameStatus: vi.fn(() => () => undefined),
  };
}

describe('AI frame controls', () => {
  test('runs the selected granularity and pauses with retry after failure', async () => {
    const current = runtime(async () => ({ ok: false, error: 'DeepSeek timeout' }));
    render(<FrameControls runtime={current} />);

    fireEvent.click(screen.getByRole('button', { name: '\u534a\u5929' }));
    fireEvent.click(screen.getByRole('button', { name: '\u63a8\u8fdb\u4e00\u5e27' }));

    await waitFor(() => expect(current.runFrame).toHaveBeenCalledWith('12h'));
    expect(await screen.findByRole('alert')).toHaveTextContent('DeepSeek timeout');
    expect(screen.getByRole('button', { name: '\u91cd\u8bd5\u5f53\u524d\u5e27' })).toBeInTheDocument();
  });

  test('pause waits for the current request instead of aborting it', async () => {
    let release!: (result: FrameRunResult) => void;
    const pending = new Promise<FrameRunResult>((resolve) => { release = resolve; });
    const current = runtime(() => pending);
    render(<FrameControls runtime={current} />);

    fireEvent.click(screen.getByRole('button', { name: '\u8fde\u7eed\u8fd0\u884c' }));
    await waitFor(() => expect(current.runFrame).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: '\u6682\u505c' }));

    expect(current.cancelAfterCurrentFrame).toHaveBeenCalledOnce();
    expect(current.runFrame).toHaveBeenCalledOnce();
    release({
      ok: true,
      world: {} as never,
      usage: { model: 'deepseek-flash', inputTokens: 1, outputTokens: 1, durationMs: 1, estimatedCost: 0 },
    });
    await pending;
  });
});
