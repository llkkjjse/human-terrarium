import { describe, expect, test } from 'vitest';
import { prepareFrame, resolveFrame } from '../../src/sim/resolver';
import { frameResponse, resolverWorld } from './resolver-fixture';

describe('resolver determinism and transactionality', () => {
  test('returns identical results for identical state, response and seed without mutating input', () => {
    const world = resolverWorld(5150);
    const original = structuredClone(world);
    const preparedA = prepareFrame(world, []);
    const preparedB = prepareFrame(world, []);
    const response = frameResponse(preparedA.world, {
      [world.residents[0].id]: {
        action: 'work',
        locationId: 'commerce',
        priorityBasis: 'routine',
        reason: 'Work the scheduled shift.',
      },
    });

    const first = resolveFrame({ prepared: preparedA, response, granularity: '12h' });
    const second = resolveFrame({ prepared: preparedB, response: structuredClone(response), granularity: '12h' });

    expect(first).toEqual(second);
    expect(world).toEqual(original);
  });
});
