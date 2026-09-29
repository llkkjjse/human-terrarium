import type { WorldState, WorldStateV2 } from '../sim/types';
import { applyOfflineProgress } from './save';

interface BootStore {
  hasSave(): Promise<boolean>;
  load(): Promise<WorldState>;
}

export interface BootState {
  world: WorldState;
  canPersist: boolean;
  notice: string | null;
}

interface V2BootStore {
  hasSave(): Promise<boolean>;
  loadV2(): Promise<WorldStateV2>;
}

export interface BootStateV2 {
  world: WorldStateV2 | null;
  canPersist: boolean;
  notice: string | null;
}

export async function resolveV2BootState(store: V2BootStore): Promise<BootStateV2> {
  try {
    if (!await store.hasSave()) return { world: null, canPersist: true, notice: null };
    return { world: await store.loadV2(), canPersist: true, notice: null };
  } catch {
    return {
      world: null,
      canPersist: false,
      notice: '现有存档读取失败。自动保存已暂停，原存档未覆盖。',
    };
  }
}

export async function resolveBootState(
  store: BootStore,
  createFallback: () => WorldState,
  now = Date.now(),
): Promise<BootState> {
  const fallback = createFallback();
  try {
    if (!await store.hasSave()) return { world: fallback, canPersist: true, notice: null };
    const restored = await store.load();
    return { world: applyOfflineProgress(restored, now).world, canPersist: true, notice: null };
  } catch {
    return {
      world: fallback,
      canPersist: false,
      notice: '现有存档读取失败。已进入临时新世界，自动保存已暂停，原存档未覆盖。',
    };
  }
}
