import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createRuntime, type HumanTerrariumApi } from './api/runtime';
import { SaveDatabase } from './persistence/database';
import { applyOfflineProgress } from './persistence/save';
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
  let world = createWorld({ seed: Math.floor(Math.random() * 0x7fffffff), scenario: getPreset('stable-modern') });
  try {
    if (await database.hasSave()) world = applyOfflineProgress(await database.load()).world;
  } catch (error) {
    console.warn('存档读取失败，已使用新世界。', error);
  }

  const runtime = createRuntime(world);
  window.HumanTerrarium = { v1: runtime };
  const root = createRoot(document.getElementById('root')!);
  root.render(<StrictMode><TerrariumApp runtime={runtime} /></StrictMode>);

  const persist = () => { void database.save(runtime.getWorldSnapshot()); };
  window.setInterval(persist, 30_000);
  window.addEventListener('pagehide', persist);
}

void boot();

