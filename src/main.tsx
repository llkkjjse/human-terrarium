import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createRuntime, type HumanTerrariumApi } from './api/runtime';
import { resolveBootState } from './persistence/boot';
import { SaveDatabase } from './persistence/database';
import { getPreset } from './sim/scenarios';
import { createWorld } from './sim/world';
import { TerrariumApp } from './ui/App';
import './styles.css';

declare global {
  interface Window {
    HumanTerrarium: { v1: HumanTerrariumApi };
  }
}

async function boot(): Promise<void> {
  const database = new SaveDatabase();
  const bootState = await resolveBootState(
    database,
    () => createWorld({ seed: Math.floor(Math.random() * 0x7fffffff), scenario: getPreset('stable-modern') }),
  );

  const runtime = createRuntime(bootState.world);
  window.HumanTerrarium = { v1: runtime };
  const root = createRoot(document.getElementById('root')!);
  root.render(<StrictMode><TerrariumApp runtime={runtime} initialNotice={bootState.notice} /></StrictMode>);

  if (bootState.canPersist) {
    const persist = () => {
      void database.save(runtime.getWorldSnapshot()).catch(() => {
        window.dispatchEvent(new CustomEvent('terrarium:persistence-error', {
          detail: '自动保存失败，本次进度尚未写入浏览器存储。',
        }));
      });
    };
    window.setInterval(persist, 30_000);
    window.addEventListener('pagehide', persist);
  }
}

void boot();
