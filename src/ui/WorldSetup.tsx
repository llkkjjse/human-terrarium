import { useMemo, useState } from 'react';
import type { AiClient } from '../ai/client';
import type { AiUsage } from '../ai/contracts';
import { worldStateV2Schema } from '../sim/schema';
import type { WorldStateV2 } from '../sim/types';

const text = {
  title: '\u521b\u5efa\u4f60\u7684\u4eba\u7c7b\u751f\u6001\u7bb1',
  description: '\u793e\u4f1a\u63cf\u8ff0',
  inequality: '\u9636\u7ea7\u5dee\u8ddd',
  mobility: '\u9636\u7ea7\u6d41\u52a8',
  trust: '\u793e\u4f1a\u4fe1\u4efb',
  corruption: '\u8150\u8d25\u7a0b\u5ea6',
  crime: '\u72af\u7f6a\u538b\u529b',
  gossip: '\u516b\u5366\u4f20\u64ad',
  generate: '\u751f\u6210\u793e\u4f1a',
  confirm: '\u786e\u8ba4\u5e76\u8fdb\u5165\u793e\u4f1a',
  residentName: '\u5c45\u6c11\u59d3\u540d',
  retry: '\u4fdd\u7559\u5f53\u524d\u63cf\u8ff0\uff0c\u8bf7\u68c0\u67e5 DeepSeek \u914d\u7f6e\u540e\u91cd\u8bd5\u3002',
};

type Axis = 'inequality' | 'mobility' | 'trust' | 'corruption' | 'crimePressure' | 'gossip';
const axisLabels: Record<Axis, string> = {
  inequality: text.inequality,
  mobility: text.mobility,
  trust: text.trust,
  corruption: text.corruption,
  crimePressure: text.crime,
  gossip: text.gossip,
};

export interface WorldSetupProps {
  aiClient: Pick<AiClient, 'generateWorld'>;
  onConfirm(world: WorldStateV2, usage: AiUsage): void | Promise<void>;
  notice?: string | null;
}

export function WorldSetup({ aiClient, onConfirm, notice = null }: WorldSetupProps) {
  const [description, setDescription] = useState('');
  const [axes, setAxes] = useState<Record<Axis, number>>({
    inequality: 55, mobility: 45, trust: 55, corruption: 20, crimePressure: 35, gossip: 55,
  });
  const [preview, setPreview] = useState<WorldStateV2 | null>(null);
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validPreview = useMemo(
    () => preview ? worldStateV2Schema.safeParse(preview).success && preview.residents.length === 24 : false,
    [preview],
  );

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const generated = await aiClient.generateWorld({
        description,
        blueprint: { social: structuredClone(axes) },
      });
      const parsed = worldStateV2Schema.parse(generated.data);
      setPreview(structuredClone(parsed));
      setUsage(structuredClone(generated.usage));
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : 'DeepSeek request failed.'} ${text.retry}`);
    } finally {
      setBusy(false);
    }
  };

  const renameResident = (residentId: string, name: string) => {
    setPreview((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const resident = next.residents.find((item) => item.id === residentId);
      if (resident) resident.name = name;
      return next;
    });
  };

  return (
    <main className={'setup-shell'}>
      <section className={'setup-card'}>
        <p className={'eyebrow'}>HUMAN TERRARIUM / WORLD GENESIS</p>
        <h1>{text.title}</h1>
        {notice && <div className={'setup-notice'} role={'status'}>{notice}</div>}
        <label className={'setup-description'}>
          <span>{text.description}</span>
          <textarea
            aria-label={text.description}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={'\u4f8b\u5982\uff1a\u9636\u7ea7\u5dee\u8ddd\u660e\u663e\uff0c\u6cbb\u5b89\u5b98\u4e5f\u662f\u666e\u901a\u5c45\u6c11\u2026\u2026'}
          />
        </label>
        <div className={'setup-axes'}>
          {(Object.keys(axisLabels) as Axis[]).map((axis) => (
            <label key={axis}>
              <span>{axisLabels[axis]} <b>{axes[axis]}</b></span>
              <input
                aria-label={axisLabels[axis]}
                type={'range'}
                min={0}
                max={100}
                value={axes[axis]}
                onChange={(event) => setAxes((current) => ({ ...current, [axis]: Number(event.target.value) }))}
              />
            </label>
          ))}
        </div>
        <button className={'primary-action'} disabled={busy || !description.trim()} onClick={() => void generate()}>
          {busy ? 'DeepSeek...' : text.generate}
        </button>
        {error && <p className={'form-error'} role={'alert'}>{error}</p>}
      </section>

      {preview && (
        <section className={'setup-preview'}>
          <header>
            <div><p>24 RESIDENTS / PREVIEW</p><h2>{preview.blueprint.name}</h2></div>
            <button
              className={'primary-action'}
              disabled={!validPreview || !usage}
              onClick={() => usage && void onConfirm(structuredClone(preview), structuredClone(usage))}
            >
              {text.confirm}
            </button>
          </header>
          <div className={'preview-residents'}>
            {preview.residents.map((resident, index) => (
              <label key={resident.id}>
                <span>{String(index + 1).padStart(2, '0')} / {resident.role}</span>
                <input
                  aria-label={`${text.residentName} ${index + 1}`}
                  value={resident.name}
                  onChange={(event) => renameResident(resident.id, event.target.value)}
                />
                <small>{resident.realClass} / {resident.perceivedClass}</small>
              </label>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
