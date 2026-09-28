import Dexie, { type Table } from 'dexie';
import { createSave, parseSave, type SaveEnvelope } from './save';
import type { WorldState } from '../sim/types';

interface SaveRecord extends SaveEnvelope {
  slot: 'primary' | 'backup';
}

interface IndexedDbDependencies {
  indexedDB: IDBFactory;
  IDBKeyRange: typeof IDBKeyRange;
}

class TerrariumDatabase extends Dexie {
  saves!: Table<SaveRecord, SaveRecord['slot']>;

  constructor(name: string, dependencies?: IndexedDbDependencies) {
    super(name, dependencies);
    this.version(1).stores({ saves: 'slot,savedAt' });
  }
}

export class SaveDatabase {
  private readonly database: TerrariumDatabase;

  constructor(name = 'human-terrarium', dependencies?: IndexedDbDependencies) {
    this.database = new TerrariumDatabase(name, dependencies);
  }

  async save(world: WorldState, savedAt = Date.now()): Promise<void> {
    await this.database.transaction('rw', this.database.saves, async () => {
      const current = await this.database.saves.get('primary');
      if (current) await this.database.saves.put({ ...current, slot: 'backup' });
      await this.database.saves.put({ ...createSave(world, savedAt), slot: 'primary' });
    });
  }

  async load(): Promise<WorldState> {
    const primary = await this.database.saves.get('primary');
    if (primary) {
      try {
        return parseSave(primary);
      } catch {
        // Fall through to the last known-good backup.
      }
    }
    const backup = await this.database.saves.get('backup');
    if (!backup) throw new Error('没有可用存档');
    return parseSave(backup);
  }

  async loadBackup(): Promise<WorldState | null> {
    const backup = await this.database.saves.get('backup');
    return backup ? parseSave(backup) : null;
  }

  async hasSave(): Promise<boolean> {
    return (await this.database.saves.count()) > 0;
  }

  async delete(): Promise<void> {
    await this.database.delete();
  }
}

