import { appendGlobalEvent, appendLifeLog } from './history';
import { isLocked } from './priority';
import type { ResolverContext } from './index';

function conditionFrom(description: string): string {
  if (/respiratory|breath|lung/i.test(description)) return 'respiratory infection';
  if (/injury|accident|fracture/i.test(description)) return 'injury';
  return 'illness';
}

export function resolveHealth(context: ResolverContext): void {
  for (const candidate of context.response.candidateEvents) {
    if (candidate.type !== 'illness-risk' && candidate.type !== 'accident-risk') continue;
    for (const residentId of candidate.residentIds) {
      const resident = context.world.residents.find((item) => item.id === residentId);
      if (!resident) continue;
      const environmentalRisk = candidate.type === 'illness-risk'
        ? context.world.scenario.parameters.environment.epidemicRisk
        : context.world.scenario.parameters.environment.disasterRisk;
      const threshold = Math.min(0.98, Math.max(0.02, (environmentalRisk + 30 - resident.abilities.constitution * 2) / 100)
        * Math.max(1, context.hours / 6));
      if (context.random() > threshold) continue;
      const condition = conditionFrom(candidate.description);
      if (!resident.healthConditions.includes(condition)) resident.healthConditions.push(condition);
      if (!isLocked(context.locks, resident.id, 'needs.health')) {
        resident.needs.health = Math.max(0, resident.needs.health - Math.max(3, context.hours / 2));
      }
      appendLifeLog(context.history, context.world, {
        residentId,
        kind: 'health',
        summary: `${resident.name} became unwell`,
        detail: candidate.description,
        causalId: candidate.id,
      });
      appendGlobalEvent(context.history, context.world, {
        type: 'health',
        title: `${resident.name}: ${condition}`,
        detail: candidate.description,
        residentIds: [residentId],
        causalId: candidate.id,
      });
    }
  }

  for (const resident of context.world.residents) {
    if (!resident.healthConditions.length || isLocked(context.locks, resident.id, 'needs.health')) continue;
    resident.needs.health = Math.max(0, resident.needs.health - resident.healthConditions.length * context.hours / 24);
  }
}
