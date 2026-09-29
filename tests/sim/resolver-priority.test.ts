import { describe, expect, test } from 'vitest';
import { prepareFrame, resolveFrame } from '../../src/sim/resolver';
import { frameResponse, resolverWorld } from './resolver-fixture';

describe('resolver priority', () => {
  test('absolute mutations are locked above trait and goal actions', () => {
    const world = resolverWorld();
    const resident = world.residents[0];
    resident.customTrait = 'Never accepts medical treatment.';
    resident.playerGoal = 'Go to the clinic.';

    const prepared = prepareFrame(world, [{
      id: 'forced-collapse',
      type: 'absolute-event',
      originalText: 'The resident collapses and is taken to hospital.',
      payload: {
        residentId: resident.id,
        title: 'Sudden collapse',
        detail: 'Hospitalized immediately.',
        set: { 'needs.health': 7, activity: 'seek-care', districtId: 'municipal' },
      },
    }]);
    const response = frameResponse(prepared.world, {
      [resident.id]: {
        action: 'work',
        locationId: 'commerce',
        priorityBasis: 'custom-trait',
        reason: 'Try to leave hospital and work.',
      },
    });

    const result = resolveFrame({ prepared, response, granularity: '1h' });
    const after = result.world.residents[0];
    expect(after.needs.health).toBe(7);
    expect(after.activity).toBe('seek-care');
    expect(after.districtId).toBe('municipal');
    expect(result.history.events.some((event) => event.causalId === 'forced-collapse')).toBe(true);
  });

  test('custom trait overrides a conflicting player-goal action', () => {
    const world = resolverWorld();
    const resident = world.residents[0];
    resident.customTrait = 'Will not steal under any circumstances.';
    resident.playerGoal = 'Get rich immediately.';
    const prepared = prepareFrame(world, []);
    const response = frameResponse(prepared.world, {
      [resident.id]: {
        action: 'attempt_robbery',
        targetId: world.residents[1].id,
        priorityBasis: 'player-goal',
        reason: 'Rob the neighbor to satisfy the goal.',
      },
    });

    const result = resolveFrame({ prepared, response, granularity: '1h' });
    const log = result.history.lifeLogs.find((item) => item.residentId === resident.id)!;
    expect(log.kind).toBe('routine');
    expect(log.detail).toContain('custom trait');
    expect(result.history.events.some((event) => event.title.includes('robbery'))).toBe(false);
  });
});
