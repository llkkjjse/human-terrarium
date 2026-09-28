import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, expect, test } from 'vitest';
import { SaveDatabase } from '../../src/persistence/database';
import { applyOfflineProgress, createSave, parseSave } from '../../src/persistence/save';
import { getPreset } from '../../src/sim/scenarios';
import type { WorldState } from '../../src/sim/types';
import { createWorld } from '../../src/sim/world';

const databases: SaveDatabase[] = [];
afterEach(async () => Promise.all(databases.map((database) => database.delete())));

test('saving stamps the payload so active time is not replayed as offline time', () => {
  const world = createWorld({ seed: 201, scenario: getPreset('stable-modern') });
  world.lastSavedAt = 0;
  const restored = parseSave(createSave(world, 3_600_000));

  expect(restored.lastSavedAt).toBe(3_600_000);
  expect(applyOfflineProgress(restored, 3_600_000).ticksApplied).toBe(0);
});

test('rejects a correctly checksummed world missing required structure', () => {
  const malformed = createWorld({ seed: 202, scenario: getPreset('stable-modern') }) as Partial<WorldState>;
  delete malformed.districts;
  const envelope = createSave(malformed as WorldState, 1_000);

  expect(() => parseSave(envelope)).toThrow('存档');
});

test('does not rotate a corrupt primary over a valid backup after recovery', async () => {
  const name = `recovery-${Math.random()}`;
  const database = new SaveDatabase(name, { indexedDB, IDBKeyRange });
  databases.push(database);
  const first = createWorld({ seed: 203, scenario: getPreset('stable-modern') });
  const second = createWorld({ seed: 204, scenario: getPreset('economic-downturn') });
  await database.save(first, 1_000);
  await database.save(second, 2_000);
  const raw = new Dexie(name, { indexedDB, IDBKeyRange });
  raw.version(1).stores({ saves: 'slot,savedAt' });
  await raw.table('saves').update('primary', { checksum: 'corrupt00' });

  const recovered = await database.load();
  await database.save(recovered, 3_000);

  expect(recovered.seed).toBe(203);
  expect((await database.loadBackup())?.seed).toBe(203);
  raw.close();
});
