import { useEffect, useRef, useState } from 'react';
import type { AiFrameStatus, FrameRunResult } from '../api/frame-controller';
import type { FrameGranularity } from '../sim/types';

const labels = {
  hour: '1\u5c0f\u65f6',
  halfDay: '\u534a\u5929',
  day: '1\u5929',
  step: '\u63a8\u8fdb\u4e00\u5e27',
  continuous: '\u8fde\u7eed\u8fd0\u884c',
  fast: '\u5feb\u901f\u89c2\u5bdf',
  pause: '\u6682\u505c',
  retry: '\u91cd\u8bd5\u5f53\u524d\u5e27',
};

interface FrameRuntime {
  runFrame(granularity: FrameGranularity): Promise<FrameRunResult>;
  retryFrame(): Promise<FrameRunResult>;
  cancelAfterCurrentFrame(): void;
  getAiFrameStatus(): AiFrameStatus;
  subscribeAiFrameStatus(handler: (status: AiFrameStatus) => void): () => void;
}

export function FrameControls({ runtime }: { runtime: FrameRuntime }) {
  const [granularity, setGranularity] = useState<FrameGranularity>('1h');
  const [status, setStatus] = useState(() => runtime.getAiFrameStatus());
  const [mode, setMode] = useState<'paused' | 'continuous' | 'fast'>('paused');
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(false);
  const modeRef = useRef<'paused' | 'continuous' | 'fast'>('paused');

  useEffect(() => runtime.subscribeAiFrameStatus(setStatus), [runtime]);
  useEffect(() => () => { activeRef.current = false; }, []);

  const applyResult = (result: FrameRunResult): boolean => {
    if (result.ok) {
      setError(null);
      return true;
    }
    setError(result.error);
    activeRef.current = false;
    modeRef.current = 'paused';
    setMode('paused');
    return false;
  };

  const runOnce = async (): Promise<boolean> => applyResult(await runtime.runFrame(granularity));

  const scheduleNext = () => {
    if (!activeRef.current) return;
    const delay = modeRef.current === 'fast' ? 0 : 800;
    window.setTimeout(() => {
      if (!activeRef.current) return;
      void runOnce().then((ok) => {
        if (ok) scheduleNext();
      });
    }, delay);
  };

  const start = (nextMode: 'continuous' | 'fast') => {
    if (activeRef.current) return;
    activeRef.current = true;
    modeRef.current = nextMode;
    setMode(nextMode);
    void runOnce().then((ok) => {
      if (ok) scheduleNext();
    });
  };

  const pause = () => {
    activeRef.current = false;
    modeRef.current = 'paused';
    setMode('paused');
    runtime.cancelAfterCurrentFrame();
  };

  const retry = async () => applyResult(await runtime.retryFrame());
  const busy = ['preparing', 'thinking', 'repairing', 'resolving', 'saving'].includes(status.phase);

  return (
    <section className="frame-controls" aria-label="AI frame controls">
      <div className="granularity-controls">
        {([
          ['1h', labels.hour],
          ['12h', labels.halfDay],
          ['1d', labels.day],
        ] as const).map(([value, label]) => (
          <button className={granularity === value ? 'active' : ''} key={value} onClick={() => setGranularity(value)}>
            {label}
          </button>
        ))}
      </div>
      <div className="playback-controls">
        <button disabled={busy || mode !== 'paused'} onClick={() => void runOnce()}>{labels.step}</button>
        <button disabled={mode !== 'paused'} onClick={() => start('continuous')}>{labels.continuous}</button>
        <button disabled={mode !== 'paused'} onClick={() => start('fast')}>{labels.fast}</button>
        <button disabled={mode === 'paused' && !busy} onClick={pause}>{labels.pause}</button>
      </div>
      <div className="ai-frame-status" data-phase={status.phase}>
        <span>AI / {status.phase.toUpperCase()}</span>
        {status.usage && (
          <small>
            {status.usage.durationMs}ms / {status.usage.inputTokens + status.usage.outputTokens} tokens /
            {' $'}{status.usage.estimatedCost.toFixed(4)}
          </small>
        )}
      </div>
      {(error || status.error) && (
        <div className="frame-error" role="alert">
          <span>{error ?? status.error}</span>
          <button onClick={() => void retry()}>{labels.retry}</button>
        </div>
      )}
    </section>
  );
}
