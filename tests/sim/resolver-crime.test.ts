import { describe, expect, test } from 'vitest';
import { prepareFrame, resolveFrame } from '../../src/sim/resolver';
import { frameResponse, resolverWorld } from './resolver-fixture';

describe('crime, property and bounded knowledge', () => {
  test('uses perceived wealth for an unspecified fraud target, not hidden cash', () => {
    const world = resolverWorld();
    const actor = world.residents[0];
    const hiddenRich = world.residents[1];
    const visiblyRich = world.residents[2];
    hiddenRich.finances.cash = 9_000_000;
    hiddenRich.perceivedClass = 'precarious';
    visiblyRich.finances.cash = 2_000;
    visiblyRich.perceivedClass = 'elite';
    const prepared = prepareFrame(world, []);
    const response = frameResponse(prepared.world, {
      [actor.id]: {
        action: 'select_target_for_fraud',
        priorityBasis: 'player-goal',
        reason: 'Look for someone who appears wealthy.',
      },
    });

    const result = resolveFrame({ prepared, response, granularity: '1h' });
    const log = result.history.lifeLogs.find((item) => item.residentId === actor.id && item.kind === 'planning')!;
    expect(log.detail).toContain(visiblyRich.id);
    expect(log.detail).not.toContain(hiddenRich.id);
  });

  test('conserves cash in a successful transfer and creates evidence before arrest', () => {
    const world = resolverWorld(19);
    const robber = world.residents[0];
    const victim = world.residents[1];
    const sheriff = world.residents.find((resident) => resident.role === 'safety')!;
    robber.abilities.strength = 100;
    robber.abilities.dexterity = 100;
    victim.abilities.wisdom = 1;
    victim.abilities.dexterity = 1;
    sheriff.abilities.wisdom = 100;
    sheriff.abilities.intelligence = 100;
    robber.finances.cash = 0;
    victim.finances.cash = 10_000;
    const totalBefore = world.residents.reduce((sum, resident) => sum + resident.finances.cash, 0);
    const prepared = prepareFrame(world, []);
    const response = frameResponse(prepared.world, {
      [robber.id]: {
        action: 'attempt_robbery',
        targetId: victim.id,
        priorityBasis: 'personal-goal',
        reason: 'Take money by force.',
      },
      [sheriff.id]: {
        action: 'attempt_arrest',
        targetId: robber.id,
        priorityBasis: 'policy-law',
        reason: 'Act on evidence from the reported robbery.',
      },
    });

    const result = resolveFrame({ prepared, response, granularity: '1h' });
    const totalAfter = result.world.residents.reduce((sum, resident) => sum + resident.finances.cash, 0);
    expect(totalAfter).toBe(totalBefore);
    expect(result.world.residents.find((item) => item.id === robber.id)!.legalStatus).toBe('detained');

    const chain = result.history.lifeLogs.filter((item) => item.causalId?.startsWith('crime-'));
    const evidenceIndex = chain.findIndex((item) => item.kind === 'evidence');
    const arrestIndex = chain.findIndex((item) => item.kind === 'arrest');
    expect(evidenceIndex).toBeGreaterThanOrEqual(0);
    expect(arrestIndex).toBeGreaterThan(evidenceIndex);
    expect(chain[evidenceIndex].causalId).toBe(chain[arrestIndex].causalId);

    const sheriffKnowledge = result.world.knowledge.filter((item) => item.residentId === sheriff.id);
    expect(sheriffKnowledge.some((item) => item.subjectId === robber.id)).toBe(true);
    expect(sheriffKnowledge.some((item) => item.subjectId === victim.id && item.topic === 'wealth')).toBe(false);
  });
});
