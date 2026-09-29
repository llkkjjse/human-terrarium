import { createGeneratedWorld } from '../sim/generation';
import { worldStateV2Schema } from '../sim/schema';
import type { SocietyBlueprint, WorldStateV2 } from '../sim/types';
import { parseSave, type SaveEnvelope } from './save';

export interface SaveEnvelopeV2 {
  schemaVersion: 2;
  savedAt: number;
  checksum: string;
  payload: WorldStateV2;
}

function hash(input: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(16).padStart(8, '0');
}

export function createSaveV2(world: WorldStateV2, savedAt = Date.now()): SaveEnvelopeV2 {
  const payload = structuredClone(world);
  payload.lastSavedAt = savedAt;
  worldStateV2Schema.parse(payload);
  return {
    schemaVersion: 2,
    savedAt,
    payload,
    checksum: hash(JSON.stringify(payload)),
  };
}

function parseV2(value: SaveEnvelopeV2): SaveEnvelopeV2 {
  if (!Number.isFinite(value.savedAt) || value.savedAt < 0) throw new Error('存档时间无效');
  if (hash(JSON.stringify(value.payload)) !== value.checksum) throw new Error('存档校验失败');
  const payload = worldStateV2Schema.parse(value.payload);
  if (payload.lastSavedAt !== value.savedAt) throw new Error('存档时间无效');
  return structuredClone({ ...value, payload });
}

function blueprintFromLegacy(legacy: SaveEnvelope['payload']): SocietyBlueprint {
  return {
    schemaVersion: 2,
    id: legacy.scenario.id,
    name: legacy.scenario.name,
    description: legacy.scenario.description,
    sourceText: legacy.scenario.description,
    parameters: structuredClone(legacy.scenario.parameters),
    policies: structuredClone(legacy.scenario.policies),
    districts: structuredClone(legacy.districts),
    social: {
      inequality: legacy.scenario.parameters.economy.inequality,
      mobility: legacy.metrics.mobility,
      trust: legacy.scenario.parameters.culture.socialTrust,
      corruption: 0,
      crimePressure: 100 - legacy.scenario.parameters.institutions.publicSafety,
      gossip: legacy.scenario.parameters.technology.information,
    },
  };
}

export function migrateSaveToV2(input: unknown): SaveEnvelopeV2 {
  if (input && typeof input === 'object' && (input as { schemaVersion?: unknown }).schemaVersion === 2) {
    return parseV2(input as SaveEnvelopeV2);
  }
  const legacy = parseSave(input as string | SaveEnvelope);
  const blueprint = blueprintFromLegacy(legacy);
  const generated = createGeneratedWorld({
    seed: legacy.seed,
    blueprint,
    residents: legacy.residents.map((resident) => ({
      name: resident.name,
      age: resident.age,
      role: resident.role,
    })),
  });
  const generatedById = new Map(generated.residents.map((resident) => [resident.id, resident]));
  generated.residents = legacy.residents.map((resident) => ({
    ...generatedById.get(resident.id)!,
    ...structuredClone(resident),
  }));
  generated.scenario = structuredClone(legacy.scenario);
  generated.tick = legacy.tick;
  generated.day = legacy.day;
  generated.minuteOfDay = legacy.minuteOfDay;
  generated.timeScale = legacy.timeScale;
  generated.metrics = structuredClone(legacy.metrics);
  generated.events = structuredClone(legacy.events);
  generated.nextEventSequence = legacy.nextEventSequence;
  generated.lastSavedAt = legacy.lastSavedAt;
  return createSaveV2(generated, legacy.lastSavedAt);
}
