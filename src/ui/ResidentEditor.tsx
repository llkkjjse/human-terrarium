import { useEffect, useState } from 'react';
import type { AiClient } from '../ai/client';
import type { CommandResult, WorldCommand } from '../sim/commands';
import type { AbilityScores, ResidentV2 } from '../sim/types';

interface EditorRuntime {
  dispatch(command: WorldCommand): Promise<CommandResult>;
}

const abilityLabels: Record<keyof AbilityScores, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  charisma: 'Charisma',
};

export function ResidentEditor({
  resident,
  worldId,
  runtime,
  aiClient,
}: {
  resident: ResidentV2;
  worldId: string;
  runtime: EditorRuntime;
  aiClient: Pick<AiClient, 'parseAbsoluteEvent'>;
}) {
  const [trait, setTrait] = useState(resident.customTrait);
  const [goal, setGoal] = useState(resident.playerGoal);
  const [abilities, setAbilities] = useState<AbilityScores>(() => structuredClone(resident.abilities));
  const [forcedText, setForcedText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTrait(resident.customTrait);
    setGoal(resident.playerGoal);
    setAbilities(structuredClone(resident.abilities));
  }, [resident.id, resident.customTrait, resident.playerGoal, resident.abilities]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const commands: WorldCommand[] = [
        { type: 'set-custom-trait', residentId: resident.id, trait },
        { type: 'edit-resident', residentId: resident.id, patch: { abilities } },
      ];
      if (goal !== resident.playerGoal) commands.push({ type: 'set-personal-goal', residentId: resident.id, goal });
      for (const command of commands) {
        const result = await runtime.dispatch(command);
        if (!result.ok) throw new Error(result.message);
      }
      setMessage('Resident edits committed for the next frame.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Resident edit failed.');
    } finally {
      setBusy(false);
    }
  };

  const forceEvent = async () => {
    setBusy(true);
    setError(null);
    try {
      const parsed = await aiClient.parseAbsoluteEvent({ text: forcedText, worldId, residentId: resident.id });
      const result = await runtime.dispatch({
        type: 'queue-absolute-event',
        event: parsed.data,
        residentId: resident.id,
      });
      if (!result.ok) throw new Error(result.message);
      setMessage('\u5f3a\u5236\u4e8b\u4ef6\u5df2\u6392\u5165\u4e0b\u4e00\u5e27\uff0c\u5c06\u5fc5\u7136\u53d1\u751f\u3002');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Forced event parsing failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={'resident-editor'}>
      <label>
        <span>Custom trait</span>
        <textarea aria-label={'Custom trait'} value={trait} onChange={(event) => setTrait(event.target.value)} />
      </label>
      <label>
        <span>Player goal</span>
        <textarea aria-label={'Player goal'} value={goal} onChange={(event) => setGoal(event.target.value)} />
      </label>
      <div className={'ability-editor'}>
        {(Object.keys(abilityLabels) as Array<keyof AbilityScores>).map((ability) => (
          <label key={ability}>
            <span>{abilityLabels[ability]}</span>
            <input
              aria-label={abilityLabels[ability]}
              type={'number'}
              value={abilities[ability]}
              onChange={(event) => setAbilities((current) => ({ ...current, [ability]: Number(event.target.value) }))}
            />
          </label>
        ))}
      </div>
      <button disabled={busy} onClick={() => void save()}>Save resident edits</button>
      <div className={'forced-event-editor'}>
        <label>
          <span>Forced event</span>
          <textarea
            aria-label={'Forced event'}
            value={forcedText}
            onChange={(event) => setForcedText(event.target.value)}
            placeholder={'Describe what must happen next. DeepSeek only translates it; local rules execute it.'}
          />
        </label>
        <button disabled={busy || !forcedText.trim()} onClick={() => void forceEvent()}>Queue forced event</button>
      </div>
      {message && <p className={'form-success'} role={'status'}>{message}</p>}
      {error && <p className={'form-error'} role={'alert'}>{error}</p>}
    </div>
  );
}
