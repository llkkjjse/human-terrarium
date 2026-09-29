import { useState } from 'react';
import type { AiClient } from '../ai/client';
import { commandSchema, type CommandResult, type WorldCommand } from '../sim/commands';

const labels = {
  title: '\u81ea\u7136\u8bed\u8a00\u653f\u7b56',
  intensity: '\u653f\u7b56\u5f3a\u5ea6',
  implement: '\u6b63\u5f0f\u5b9e\u65bd\u653f\u7b56',
  success: '\u653f\u7b56\u5df2\u7f16\u8bd1\u5e76\u6392\u5165\u4e0b\u4e00\u5e27\u3002',
};

interface PolicyRuntime {
  dispatch(command: WorldCommand): Promise<CommandResult>;
}

export function PolicyEditor({
  aiClient,
  runtime,
  worldId,
}: {
  aiClient: Pick<AiClient, 'compilePolicy'>;
  runtime: PolicyRuntime;
  worldId: string;
}) {
  const [draft, setDraft] = useState('');
  const [intensity, setIntensity] = useState(60);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const implement = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const compiled = await aiClient.compilePolicy({
        text: `${draft}\n\u653f\u7b56\u5f3a\u5ea6\uff1a${intensity}`,
        worldId,
      });
      const command = commandSchema.parse({
        type: 'implement-policy',
        originalText: draft,
        policy: { ...compiled.data, intensity },
      });
      const result = await runtime.dispatch(command);
      if (!result.ok) throw new Error(result.message);
      setMessage(labels.success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Policy compilation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={'policy-editor'} aria-label={'Policy editor'}>
      <div className={'panel-heading'}><span>AI</span><div><p>POLICY COMPILER</p><h2>{labels.title}</h2></div></div>
      <textarea
        aria-label={labels.title}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={'\u8f93\u5165\u4f60\u5e0c\u671b\u957f\u671f\u751f\u6548\u7684\u793e\u4f1a\u89c4\u5219'}
      />
      <label className={'policy-intensity'}>
        <span>{labels.intensity} <b>{intensity}</b></span>
        <input
          aria-label={labels.intensity}
          type={'range'}
          min={0}
          max={100}
          value={intensity}
          onChange={(event) => setIntensity(Number(event.target.value))}
        />
      </label>
      <button disabled={busy || !draft.trim()} onClick={() => void implement()}>
        {busy ? 'DeepSeek...' : labels.implement}
      </button>
      {message && <p className={'form-success'} role={'status'}>{message}</p>}
      {error && <p className={'form-error'} role={'alert'}>{error}</p>}
    </section>
  );
}
