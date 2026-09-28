import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, describe, expect, test } from 'vitest';
import { SaveDatabase } from '../../src/persistence/database';
import { getPreset } from '../../src/sim/scenarios';
import { createWorld } from '../../src/sim/world';

describe('IndexedDB save slots', () => {
  const databases: SaveDatabase[] = [];
  afterEach(async () => Promise.all(databases.map((database) => database.delete())));

  test('stores the latest world and keeps the previous save as backup', async () => {
    const database = new SaveDatabase(`terrarium-${Math.random()}`, { indexedDB, IDBKeyRange });
    databases.push(database);
    const first = createWorld({ seed: 31, scenario: getPreset('stable-modern') });
    const second = createWorld({ seed: 32, scenario: getPreset('economic-downturn') });

    await database.save(first, 1_000);
    await database.save(second, 2_000);

    expect((await database.load()).seed).toBe(32);
    expect((await database.loadBackup())?.seed).toBe(31);
  });
});

