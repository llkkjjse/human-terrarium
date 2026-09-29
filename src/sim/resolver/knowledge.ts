import type { KnowledgeRecord } from '../types';
import { appendConversation } from './history';
import type { ResolverContext } from './index';

function shareOneRecord(context: ResolverContext, speakerId: string, listenerId: string): void {
  const source = context.world.knowledge
    .filter((item) => item.residentId === speakerId)
    .sort((left, right) => right.confidence - left.confidence || left.id.localeCompare(right.id))[0];
  if (!source) return;
  const id = `knowledge-${context.world.tick}-${listenerId}-${source.subjectId}-gossip`;
  if (context.world.knowledge.some((item) => item.id === id)) return;
  const copy: KnowledgeRecord = {
    ...source,
    id,
    residentId: listenerId,
    source: 'conversation',
    confidence: Math.max(5, source.confidence - 20),
    lastUpdatedTick: context.world.tick,
    rumor: true,
  };
  context.world.knowledge.push(copy);
  const listener = context.world.residents.find((resident) => resident.id === listenerId);
  listener?.knowledgeIds.push(id);
  context.history.knowledge.push({ ...copy, worldId: context.world.blueprint.id });
}

export function resolveKnowledge(context: ResolverContext): void {
  for (const conversation of context.response.conversations) {
    const residents = conversation.participantIds.map((id) => context.world.residents.find((item) => item.id === id));
    if (residents.some((resident) => !resident)) continue;
    if (residents.some((resident) => resident!.districtId !== conversation.locationId)) continue;
    appendConversation(context.history, context.world, conversation);
    shareOneRecord(context, conversation.participantIds[0], conversation.participantIds[1]);
    shareOneRecord(context, conversation.participantIds[1], conversation.participantIds[0]);
  }
}
