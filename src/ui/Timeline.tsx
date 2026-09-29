import { useMemo, useState } from 'react';
import type { WorldEvent } from '../sim/types';

type TimelineFilter = 'all' | 'policy' | 'health' | 'crime';
const controlTitles = /goal committed|custom trait committed|resident edit committed|simulation advance/i;
const crimeTitles = /crime|robbery|fraud|arrest|evidence|protest|riot|murder/i;

function isForced(event: WorldEvent): boolean {
  return /\u73a9\u5bb6\u5f3a\u5236\u4e8b\u4ef6|player-forced event/i.test(event.title);
}

function isHighValue(event: WorldEvent): boolean {
  if (controlTitles.test(event.title)) return false;
  if (['tick', 'activity', 'dialogue', 'relationship'].includes(event.type)) return false;
  if (event.type === 'system') return crimeTitles.test(event.title) || isForced(event);
  return ['policy', 'health', 'death', 'economy', 'opportunity', 'migration'].includes(event.type);
}

export function Timeline({ events }: { events: WorldEvent[] }) {
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const visible = useMemo(() => {
    const forcedCausalIds = new Set(events.filter(isForced).map((event) => event.causalId).filter(Boolean));
    return events.filter((event) => {
      const forcedChain = isForced(event) || Boolean(event.causalId && forcedCausalIds.has(event.causalId));
      if (forcedChain) return true;
      if (!isHighValue(event)) return false;
      if (filter === 'all') return true;
      if (filter === 'crime') return crimeTitles.test(event.title);
      return event.type === filter;
    });
  }, [events, filter]);

  return (
    <section className={'timeline'} aria-label={'Global timeline'}>
      <div className={'timeline-heading'}>
        <div><p>CAUSAL TRACE</p><h2>{'\u5168\u5c40\u65f6\u95f4\u7ebf'}</h2></div>
        <select aria-label={'Timeline filter'} value={filter} onChange={(event) => setFilter(event.target.value as TimelineFilter)}>
          <option value={'all'}>ALL</option>
          <option value={'policy'}>POLICY</option>
          <option value={'health'}>HEALTH</option>
          <option value={'crime'}>CRIME</option>
        </select>
      </div>
      <div className={'timeline-list'}>
        {visible.length === 0 && <p className={'empty-copy'}>No major public events.</p>}
        {[...visible].reverse().map((event) => (
          <article className={isForced(event) ? 'forced-event' : ''} key={event.id}>
            <span>{isForced(event) ? '\u73a9\u5bb6\u5f3a\u5236\u4e8b\u4ef6' : event.type.toUpperCase()}</span>
            <div><strong>{event.title}</strong><p>{event.detail}</p></div>
            <code>{event.causalId ?? `T${event.tick}`}</code>
          </article>
        ))}
      </div>
    </section>
  );
}
