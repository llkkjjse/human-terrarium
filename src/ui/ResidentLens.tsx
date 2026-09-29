import { useState } from 'react';
import type { AiClient } from '../ai/client';
import type { CommandResult, WorldCommand } from '../sim/commands';
import type { ResidentV2, WorldStateV2 } from '../sim/types';
import { HistoryList, type HistoryStore } from './HistoryList';
import { ResidentEditor } from './ResidentEditor';

type LensTab = 'profile' | 'traits' | 'goals' | 'life' | 'relations' | 'history' | 'conversations' | 'legal';

interface LensRuntime {
  dispatch(command: WorldCommand): Promise<CommandResult>;
}

const tabLabels: Array<[LensTab, string, string]> = [
  ['profile', 'Profile & assets', '\u6863\u6848\u4e0e\u8d44\u4ea7'],
  ['traits', 'Traits & abilities', '\u7279\u6027\u4e0e\u5c5e\u6027'],
  ['goals', 'Goals & plans', '\u76ee\u6807\u4e0e\u8ba1\u5212'],
  ['life', 'Daily life', '\u751f\u6d3b\u72b6\u6001'],
  ['relations', 'Relations & knowledge', '\u5173\u7cfb\u4e0e\u8ba4\u77e5'],
  ['history', 'Life history', '\u6c38\u4e45\u751f\u6d3b\u53f2'],
  ['conversations', 'Conversations', '\u5b8c\u6574\u5bf9\u8bdd'],
  ['legal', 'Crime & legal', '\u72af\u7f6a\u4e0e\u6cd5\u5f8b'],
];

export function ResidentLens({
  world,
  resident,
  runtime,
  aiClient,
  historyStore,
}: {
  world: WorldStateV2;
  resident: ResidentV2;
  runtime: LensRuntime;
  aiClient: Pick<AiClient, 'parseAbsoluteEvent'>;
  historyStore: HistoryStore;
}) {
  const [tab, setTab] = useState<LensTab>('profile');
  const assets = world.assets.filter((asset) => asset.ownerId === resident.id);
  const knowledge = world.knowledge.filter((item) => item.residentId === resident.id);

  return (
    <section className={'resident-lens'} aria-label={'Resident lens'}>
      <header className={'lens-header'}>
        <div className={'portrait'} style={{ background: resident.color }}>{resident.name.slice(0, 1)}</div>
        <div><p>{resident.role} / {resident.realClass}</p><h2>{resident.name}</h2><span>{resident.activity}</span></div>
      </header>
      <nav className={'lens-tabs'}>
        {tabLabels.map(([id, accessible, visible]) => (
          <button
            aria-label={accessible}
            className={tab === id ? 'active' : ''}
            key={id}
            onClick={() => setTab(id)}
          >
            {visible}
          </button>
        ))}
      </nav>
      <div className={'lens-panel'}>
        {tab === 'profile' && (
          <div className={'lens-grid'}>
            <Info label={'Age'} value={resident.age} />
            <Info label={'Real class'} value={resident.realClass} />
            <Info label={'Perceived class'} value={resident.perceivedClass} />
            <Info label={'Cash'} value={resident.finances.cash} />
            <Info label={'Income'} value={resident.finances.income} />
            <Info label={'Debt'} value={resident.finances.debt} />
            {assets.map((asset) => <Info key={asset.id} label={asset.kind} value={`${asset.name} / ${asset.value}`} />)}
          </div>
        )}
        {tab === 'traits' && (
          <>
            <section className={'generated-personality'} aria-label={'Generated personality'}>
              {Object.entries(resident.personality).map(([name, value]) => <span key={name}>{name}: {value}</span>)}
            </section>
            <ResidentEditor resident={resident} worldId={world.blueprint.id} runtime={runtime} aiClient={aiClient} />
          </>
        )}
        {tab === 'goals' && (
          <div className={'lens-copy'}>
            <h3>Player goal</h3><p>{resident.playerGoal || '-'}</p>
            <h3>Personal goal</h3><p>{resident.personalGoal || '-'}</p>
            <h3>Current plan</h3><ol>{resident.currentPlan.map((step) => <li key={step}>{step}</li>)}</ol>
          </div>
        )}
        {tab === 'life' && (
          <div className={'lens-grid'}>
            <Info label={'Activity'} value={resident.activity} />
            {Object.entries(resident.needs).map(([name, value]) => <Info key={name} label={name} value={Math.round(value)} />)}
            <Info label={'Conditions'} value={resident.healthConditions.join(', ') || '-'} />
          </div>
        )}
        {tab === 'relations' && (
          <div className={'lens-copy'}>
            <h3>Relationships</h3>
            <ul>{Object.entries(resident.relationships).map(([id, value]) => <li key={id}>{id}: {value}</li>)}</ul>
            <h3>Subjective knowledge</h3>
            {knowledge.map((item) => <article key={item.id}><strong>{item.subjectId}</strong><p>{item.claim}</p><small>{item.source} / {item.confidence}%</small></article>)}
          </div>
        )}
        {tab === 'history' && (
          <HistoryList store={historyStore} worldId={world.blueprint.id} residentId={resident.id} kind={'life'} />
        )}
        {tab === 'conversations' && (
          <HistoryList store={historyStore} worldId={world.blueprint.id} residentId={resident.id} kind={'conversation'} />
        )}
        {tab === 'legal' && (
          <div className={'lens-grid'}>
            <Info label={'Legal status'} value={resident.legalStatus} />
            <Info label={'Reputation'} value={resident.reputation} />
            {knowledge.filter((item) => item.topic === 'event').map((item) => <Info key={item.id} label={item.source} value={item.claim} />)}
          </div>
        )}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return <div className={'lens-info'}><span>{label}</span><strong>{value}</strong></div>;
}
