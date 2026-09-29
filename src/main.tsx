import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserAiClient } from './ai/client';
import type { AiUsage } from './ai/contracts';
import { createRuntime, type AiHumanTerrariumApi } from './api/runtime';
import type { RuntimeDependencies } from './api/frame-controller';
import { resolveV2BootState, type BootStateV2 } from './persistence/boot';
import { SaveDatabase, type HistoryBatch } from './persistence/database';
import type { WorldStateV2 } from './sim/types';
import { AiTerrariumApp } from './ui/App';
import { WorldSetup } from './ui/WorldSetup';
import './styles.css';

declare global {
  interface Window {
    HumanTerrarium?: { v2: AiHumanTerrariumApi };
  }
}

const emptyHistory = (): HistoryBatch => ({
  lifeLogs: [],
  conversations: [],
  events: [],
  knowledge: [],
  memories: [],
});

function Root({
  database,
  aiClient,
  bootState,
  dependencies,
  initialRuntime,
}: {
  database: SaveDatabase;
  aiClient: BrowserAiClient;
  bootState: BootStateV2;
  dependencies: RuntimeDependencies;
  initialRuntime: AiHumanTerrariumApi | null;
}) {
  const [runtime, setRuntime] = useState<AiHumanTerrariumApi | null>(initialRuntime);

  const confirmWorld = async (input: WorldStateV2, usage: AiUsage) => {
    const world = structuredClone(input);
    world.lastSavedAt = Date.now();
    if (bootState.canPersist) {
      await database.commitFrame(world, emptyHistory(), {
        id: `ai-run-${world.blueprint.id}-generation-${Date.now()}`,
        worldId: world.blueprint.id,
        frameStartTick: world.tick,
        status: 'success',
        durationMs: usage.durationMs,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        estimatedCost: usage.estimatedCost,
      });
    }
    const nextRuntime = createRuntime(world, dependencies);
    window.HumanTerrarium = { v2: nextRuntime };
    setRuntime(nextRuntime);
  };

  if (!runtime) {
    return <WorldSetup aiClient={aiClient} onConfirm={confirmWorld} notice={bootState.notice} />;
  }
  return (
    <AiTerrariumApp
      runtime={runtime}
      aiClient={aiClient}
      historyStore={database}
      initialNotice={bootState.notice}
    />
  );
}

async function boot(): Promise<void> {
  const database = new SaveDatabase();
  const aiClient = new BrowserAiClient();
  const bootState = await resolveV2BootState(database);
  const frameStore: RuntimeDependencies['frameStore'] = bootState.canPersist
    ? database
    : {
      commitFrame: async () => {
        throw new Error('Persistence is disabled to protect the unreadable existing save.');
      },
    };
  const dependencies: RuntimeDependencies = { aiClient, frameStore };
  const initialRuntime = bootState.world ? createRuntime(bootState.world, dependencies) : null;
  if (initialRuntime) window.HumanTerrarium = { v2: initialRuntime };

  const root = createRoot(document.getElementById('root')!);
  root.render(
    <StrictMode>
      <Root
        database={database}
        aiClient={aiClient}
        bootState={bootState}
        dependencies={dependencies}
        initialRuntime={initialRuntime}
      />
    </StrictMode>,
  );
}

void boot();
