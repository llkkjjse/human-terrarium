import { describe, expect, test } from 'vitest';
import { migrateSaveToV2 } from '../../src/persistence/migrate';
import { createSave } from '../../src/persistence/save';
import { getPreset } from '../../src/sim/scenarios';
import { createWorld } from '../../src/sim/world';

describe('v1 to v2 save migration', () => {
  test('is idempotent and retains residents and events without duplicating assets', () => {
    const legacy = createWorld({ seed: 501, scenario: getPreset('stable-modern') });
    legacy.events.push({
      id: 'legacy-event',
      tick: 0,
      type: 'system',
      title: '旧世界事件',
      detail: '必须保留',
      residentIds: [legacy.residents[0].id],
    });

    const first = migrateSaveToV2(createSave(legacy, 10_000));
    const second = migrateSaveToV2(first);

    expect(second).toEqual(first);
    expect(first.payload.schemaVersion).toBe(2);
    expect(first.payload.residents.map((resident) => resident.id)).toEqual(
      legacy.residents.map((resident) => resident.id),
    );
    expect(first.payload.events).toContainEqual(expect.objectContaining({ id: 'legacy-event' }));
    expect(new Set(first.payload.assets.map((asset) => asset.id)).size).toBe(first.payload.assets.length);
    expect(first.payload.residents.every((resident) => resident.customTrait === '')).toBe(true);
  });

  test('rejects a legacy save with corrupt district references', () => {
    const legacy = createWorld({ seed: 502, scenario: getPreset('stable-modern') });
    (legacy.residents[0] as unknown as { districtId: string }).districtId = 'missing';

    expect(() => migrateSaveToV2(createSave(legacy, 10_000))).toThrow('存档');
  });
});
