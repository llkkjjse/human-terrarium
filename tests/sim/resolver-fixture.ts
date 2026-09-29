import type { FrameResponse, ResidentAction } from '../../src/ai/contracts';
import { createGeneratedWorld } from '../../src/sim/generation';
import { getPreset } from '../../src/sim/scenarios';
import type { SocietyBlueprint, WorldStateV2 } from '../../src/sim/types';
import { districts } from '../../src/sim/world';

export function resolverWorld(seed = 904): WorldStateV2 {
  const scenario = getPreset('stable-modern');
  const blueprint: SocietyBlueprint = {
    schemaVersion: 2,
    id: 'resolver-world',
    name: 'Resolver World',
    description: 'A deterministic society used by resolver tests.',
    sourceText: 'A stable but unequal community.',
    parameters: scenario.parameters,
    policies: [],
    districts: structuredClone(districts),
    social: {
      inequality: 62,
      mobility: 40,
      trust: 48,
      corruption: 18,
      crimePressure: 55,
      gossip: 65,
    },
  };
  return createGeneratedWorld({ seed, blueprint });
}

export function frameResponse(
  world: WorldStateV2,
  overrides: Partial<Record<string, Partial<ResidentAction>>> = {},
): FrameResponse {
  return {
    residentActions: world.residents.map((resident) => ({
      residentId: resident.id,
      action: 'continue' as const,
      reason: 'Continue the current routine.',
      planChange: '',
      priorityBasis: 'routine' as const,
      dialogue: [],
      ...overrides[resident.id],
    })),
    conversations: [],
    candidateEvents: [],
    memoryUpdates: [],
  };
}
