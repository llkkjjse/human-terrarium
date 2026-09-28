import type { FrameRequest } from './contracts';
import type { FrameGranularity, WorldStateV2 } from '../sim/types';

export function buildFrameRequest(
  world: WorldStateV2,
  granularity: FrameGranularity,
  selectedResidentId: string | null = null,
): FrameRequest {
  const residents = [...world.residents]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((resident) => {
      const knowledge = world.knowledge
        .filter((item) => item.residentId === resident.id)
        .sort((left, right) => right.lastUpdatedTick - left.lastUpdatedTick)
        .slice(0, 5)
        .map(({ subjectId, claim, confidence, rumor }) => ({ subjectId, claim, confidence, rumor }));
      return {
        id: resident.id,
        name: resident.name,
        role: resident.role,
        districtId: resident.districtId,
        abilities: structuredClone(resident.abilities),
        personality: structuredClone(resident.personality),
        customTrait: resident.customTrait,
        playerGoal: resident.playerGoal,
        personalGoal: resident.personalGoal,
        currentPlan: [...resident.currentPlan],
        finances: structuredClone(resident.finances),
        realClass: resident.realClass,
        perceivedClass: resident.perceivedClass,
        legalStatus: resident.legalStatus,
        healthConditions: [...resident.healthConditions],
        recentMemories: resident.memories.slice(-3).map(({ text, tone, tick }) => ({ text, tone, tick })),
        relevantKnowledge: knowledge,
      };
    });
  const selected = selectedResidentId
    ? world.residents.find((resident) => resident.id === selectedResidentId)
    : undefined;
  const selectedResidentDetail = selected ? {
    residentId: selected.id,
    needs: structuredClone(selected.needs),
    reputation: selected.reputation,
    relationships: structuredClone(selected.relationships),
    visibleAssets: world.assets
      .filter((asset) => asset.ownerId === selected.id && asset.visibleValue > 0)
      .map(({ id, kind, name, visibleValue }) => ({ id, kind, name, visibleValue })),
  } : undefined;
  return {
    protocolVersion: 1,
    worldId: world.blueprint.id,
    frameStartTick: world.tick,
    day: world.day,
    minuteOfDay: world.minuteOfDay,
    granularity,
    society: {
      name: world.blueprint.name,
      description: world.blueprint.description,
      social: structuredClone(world.blueprint.social),
      policies: world.scenario.policies
        .filter((policy) => policy.enabled)
        .map(({ id, name, description, intensity }) => ({ id, name, description, intensity })),
    },
    residents,
    absoluteEvents: world.queuedChanges
      .filter((change) => change.type === 'absolute-event')
      .map((change) => ({
        id: change.id,
        originalText: change.originalText,
        payload: structuredClone(change.payload),
      })),
    ...(selectedResidentDetail ? { selectedResidentDetail } : {}),
  };
}
