import { describe, expect, test } from 'vitest';
import { prepareFrame, resolveFrame } from '../../src/sim/resolver';
import { frameResponse, resolverWorld } from './resolver-fixture';

describe('ordinary resident life', () => {
  test('advances routine, needs and a personal log without requiring dialogue', () => {
    const world = resolverWorld();
    const beforeMinute = world.minuteOfDay;
    const beforeEnergy = world.residents[0].needs.energy;
    const prepared = prepareFrame(world, []);

    const result = resolveFrame({
      prepared,
      response: frameResponse(prepared.world),
      granularity: '1h',
    });

    expect(result.world.minuteOfDay).toBe((beforeMinute + 60) % 1440);
    expect(result.world.residents[0].needs.energy).not.toBe(beforeEnergy);
    expect(result.history.lifeLogs).toHaveLength(24);
    expect(result.history.conversations).toEqual([]);
  });

  test('progresses a candidate illness and records the same causal chain', () => {
    const world = resolverWorld(3);
    world.blueprint.parameters.environment.epidemicRisk = 100;
    world.residents[0].abilities.constitution = 1;
    const prepared = prepareFrame(world, []);
    const response = frameResponse(prepared.world);
    response.candidateEvents.push({
      id: 'illness-candidate',
      type: 'illness-risk',
      residentIds: [world.residents[0].id],
      description: 'A respiratory infection is spreading.',
    });

    const result = resolveFrame({ prepared, response, granularity: '1d' });
    expect(result.world.residents[0].healthConditions).toContain('respiratory infection');
    const related = result.history.events.filter((event) => event.causalId === 'illness-candidate');
    expect(related.length).toBeGreaterThan(0);
    expect(related.every((event) => event.causalId === 'illness-candidate')).toBe(true);
  });

  test('applies an enabled policy modifier to authoritative health resolution', () => {
    const world = resolverWorld();
    world.blueprint.parameters.environment.epidemicRisk = 0;
    world.rngState = 123456;
    const prepared = prepareFrame(world, [{
      id: 'policy-public-health',
      type: 'policy',
      originalText: 'Temporarily increase epidemic exposure for a deterministic policy test.',
      payload: {
        policy: {
          id: 'public-health-test',
          name: 'Public health test',
          description: 'Changes epidemic exposure.',
          enabled: true,
          intensity: 100,
          modifiers: [{ path: 'environment.epidemicRisk', delta: 100 }],
        },
      },
    }]);
    const response = frameResponse(prepared.world);
    response.candidateEvents.push({
      id: 'policy-illness-candidate',
      type: 'illness-risk',
      residentIds: [world.residents[0].id],
      description: 'A respiratory infection is spreading.',
    });

    const result = resolveFrame({ prepared, response, granularity: '1d' });

    expect(result.world.residents[0].healthConditions).toContain('respiratory infection');
  });
});
