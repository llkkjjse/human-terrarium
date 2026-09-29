import { useEffect, useState } from 'react';
import type { ConversationRecord, LifeLogRecord, SaveDatabase } from '../persistence/database';

const PAGE_SIZE = 20;
type HistoryStore = Pick<SaveDatabase, 'listLifeLogs' | 'listConversations'>;

export function HistoryList({
  store,
  worldId,
  residentId,
  kind,
}: {
  store: HistoryStore;
  worldId: string;
  residentId: string;
  kind: 'life' | 'conversation';
}) {
  const [items, setItems] = useState<Array<LifeLogRecord | ConversationRecord>>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (offset: number) => {
    setLoading(true);
    setError(null);
    try {
      const query = { worldId, residentId, limit: PAGE_SIZE, offset };
      const page = kind === 'life'
        ? await store.listLifeLogs(query)
        : await store.listConversations(query);
      setItems((current) => offset === 0 ? page : [...current, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'History could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setItems([]);
    setHasMore(true);
    void load(0);
  }, [worldId, residentId, kind]);

  return (
    <section className={'history-list'} aria-label={kind === 'life' ? 'Life history records' : 'Conversation records'}>
      {items.map((item) => kind === 'life' ? (
        <article key={item.id}>
          <code>T{item.tick}</code>
          <div><strong>{(item as LifeLogRecord).summary}</strong><p>{(item as LifeLogRecord).detail}</p></div>
        </article>
      ) : (
        <article key={item.id}>
          <code>T{item.tick}</code>
          <pre>{(item as ConversationRecord).text}</pre>
        </article>
      ))}
      {!loading && items.length === 0 && <p className={'empty-copy'}>No records yet.</p>}
      {error && <p className={'form-error'} role={'alert'}>{error}</p>}
      {hasMore && <button disabled={loading} onClick={() => void load(items.length)}>Load older</button>}
    </section>
  );
}

export type { HistoryStore };
