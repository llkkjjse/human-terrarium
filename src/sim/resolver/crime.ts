import type { KnowledgeRecord, ResidentV2 } from '../types';
import { appendGlobalEvent, appendLifeLog } from './history';
import { selectPerceivedTarget, transferCash } from './economy';
import type { ResolverContext } from './index';

export interface CrimeEvidence {
  causalId: string;
  actorId: string;
  victimId: string;
  kind: 'fraud' | 'robbery';
  strength: number;
}

function knowledgeForOfficer(context: ResolverContext, officer: ResidentV2, evidence: CrimeEvidence): KnowledgeRecord {
  return {
    id: `knowledge-${context.world.tick}-${officer.id}-${evidence.actorId}`,
    residentId: officer.id,
    subjectId: evidence.actorId,
    topic: 'event',
    claim: `Evidence links ${evidence.actorId} to ${evidence.kind} against ${evidence.victimId}.`,
    source: 'investigation',
    confidence: Math.min(100, 55 + evidence.strength),
    lastUpdatedTick: context.world.tick,
    rumor: false,
  };
}

function recordEvidence(context: ResolverContext, evidence: CrimeEvidence): void {
  context.crimes.push(evidence);
  appendLifeLog(context.history, context.world, {
    residentId: evidence.actorId,
    kind: 'evidence',
    summary: `Evidence created after ${evidence.kind}`,
    detail: `Physical and witness evidence now exists for ${evidence.causalId}.`,
    causalId: evidence.causalId,
  });
}

function attemptCrime(context: ResolverContext, actor: ResidentV2, kind: 'fraud' | 'robbery', explicitTarget?: string): void {
  const target = explicitTarget
    ? context.world.residents.find((resident) => resident.id === explicitTarget)
    : selectPerceivedTarget(context, actor);
  if (!target || target.id === actor.id) return;
  const attack = kind === 'robbery'
    ? actor.abilities.strength + actor.abilities.dexterity
    : actor.abilities.intelligence + actor.abilities.charisma;
  const defence = kind === 'robbery'
    ? target.abilities.dexterity + target.abilities.wisdom
    : target.abilities.wisdom + target.abilities.intelligence;
  const roll = context.random() * 20;
  const success = attack + roll >= defence + 8;
  const causalId = `crime-${context.world.tick}-${actor.id}-${context.crimes.length}`;
  let detail = `${actor.id} failed an attempted ${kind} against ${target.id}.`;
  if (success) {
    const amount = transferCash(context, target, actor, 100 + context.random() * 2_400);
    detail = `${actor.id} took ${amount} from ${target.id}.`;
    actor.legalStatus = 'suspect';
  }
  appendLifeLog(context.history, context.world, {
    residentId: actor.id,
    kind: 'crime',
    summary: `${kind} ${success ? 'succeeded' : 'failed'}`,
    detail,
    causalId,
  });
  const evidence: CrimeEvidence = {
    causalId,
    actorId: actor.id,
    victimId: target.id,
    kind,
    strength: success ? 35 : 20,
  };
  recordEvidence(context, evidence);
  appendGlobalEvent(context.history, context.world, {
    type: 'system',
    title: `${kind} incident`,
    detail,
    residentIds: [actor.id, target.id],
    causalId,
  });
}

function investigateOrArrest(context: ResolverContext, officer: ResidentV2, targetId: string | undefined, arrest: boolean): void {
  if (officer.role !== 'safety' || !targetId) return;
  const evidence = context.crimes.find((item) => item.actorId === targetId);
  if (!evidence) return;
  const knowledge = knowledgeForOfficer(context, officer, evidence);
  const existing = context.world.knowledge.find((item) => item.id === knowledge.id);
  if (!existing) {
    context.world.knowledge.push(knowledge);
    officer.knowledgeIds.push(knowledge.id);
    context.history.knowledge.push({ ...knowledge, worldId: context.world.blueprint.id });
  }
  appendLifeLog(context.history, context.world, {
    residentId: officer.id,
    kind: 'investigation',
    summary: `${officer.name} examined crime evidence`,
    detail: knowledge.claim,
    causalId: evidence.causalId,
  });
  if (!arrest) return;
  const suspect = context.world.residents.find((resident) => resident.id === targetId);
  if (!suspect) return;
  const score = officer.abilities.wisdom + officer.abilities.intelligence + evidence.strength;
  if (score + context.random() * 20 < suspect.abilities.dexterity + 15) {
    suspect.legalStatus = 'wanted';
    return;
  }
  suspect.legalStatus = 'detained';
  appendLifeLog(context.history, context.world, {
    residentId: officer.id,
    kind: 'arrest',
    summary: `${officer.name} detained ${suspect.name}`,
    detail: `The arrest relied on evidence from ${evidence.causalId}.`,
    causalId: evidence.causalId,
  });
  appendGlobalEvent(context.history, context.world, {
    type: 'system',
    title: 'Evidence-based arrest',
    detail: `${suspect.name} was detained after an investigation.`,
    residentIds: [officer.id, suspect.id],
    causalId: evidence.causalId,
  });
}

export function resolveCrime(context: ResolverContext): void {
  for (const resident of context.world.residents) {
    const action = context.actions[resident.id].action;
    if (action.action === 'attempt_robbery') attemptCrime(context, resident, 'robbery', action.targetId);
    if (action.action === 'attempt_fraud') attemptCrime(context, resident, 'fraud', action.targetId);
  }
  for (const resident of context.world.residents) {
    const action = context.actions[resident.id].action;
    if (action.action === 'investigate') investigateOrArrest(context, resident, action.targetId, false);
    if (action.action === 'attempt_arrest') investigateOrArrest(context, resident, action.targetId, true);
  }
}
