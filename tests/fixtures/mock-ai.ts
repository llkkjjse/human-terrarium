import type { Page, Route } from '@playwright/test';
import type { FrameRequest, FrameResponse } from '../../src/ai/contracts';
import { createGeneratedWorld } from '../../src/sim/generation';
import { getPreset } from '../../src/sim/scenarios';
import type { DistrictId, SocietyBlueprint } from '../../src/sim/types';
import { districts } from '../../src/sim/world';

const usage = {
  model: 'mock-deepseek',
  inputTokens: 120,
  outputTokens: 80,
  durationMs: 12,
  estimatedCost: 0.0002,
};

async function json(route: Route, data: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
}

export interface MockAiOptions {
  failFirstFrame?: boolean;
}

export async function installMockAi(page: Page, options: MockAiOptions = {}): Promise<void> {
  let frameSequence = 0;
  let eventSequence = 0;

  await page.route('**/api/world/generate', async (route) => {
    const request = route.request().postDataJSON() as { description: string; blueprint?: Partial<SocietyBlueprint> };
    const scenario = getPreset('stable-modern');
    const social = request.blueprint?.social ?? {
      inequality: 55, mobility: 45, trust: 55, corruption: 20, crimePressure: 35, gossip: 55,
    };
    const world = createGeneratedWorld({
      seed: 20260929,
      blueprint: {
        schemaVersion: 2,
        id: 'e2e-world',
        name: 'E2E Human Terrarium',
        description: request.description,
        sourceText: request.description,
        parameters: scenario.parameters,
        policies: [],
        districts: structuredClone(districts),
        social,
      },
    });
    world.residents.forEach((resident, index) => { resident.name = `Resident ${String(index + 1).padStart(2, '0')}`; });
    await json(route, { data: world, usage });
  });

  await page.route('**/api/policy/compile', async (route) => {
    await json(route, {
      data: {
        id: 'housing-support',
        name: 'Housing support',
        description: 'Support residents without homes.',
        enabled: true,
        intensity: 70,
        modifiers: [{ path: 'economy.housingPressure', delta: -12 }],
      },
      usage,
    });
  });

  await page.route('**/api/event/parse', async (route) => {
    const request = route.request().postDataJSON() as { text: string; residentId?: string };
    eventSequence += 1;
    await json(route, {
      data: {
        id: `forced-e2e-${eventSequence}`,
        originalText: request.text,
        payload: {
          residentId: request.residentId,
          title: 'Sudden illness',
          detail: 'Health is set to 12 and care begins.',
          set: { 'needs.health': 12, activity: 'seek-care', districtId: 'municipal' },
        },
      },
      usage,
    });
  });

  await page.route('**/api/frame/run', async (route) => {
    frameSequence += 1;
    if (options.failFirstFrame && frameSequence === 1) {
      await json(route, { error: 'mock timeout' }, 504);
      return;
    }
    const request = route.request().postDataJSON() as FrameRequest;
    const firstParticipant = request.residents[0];
    const secondParticipant = request.residents.find((resident, index) => (
      index > 0 && resident.districtId === firstParticipant?.districtId
    ));
    const pair = firstParticipant && secondParticipant ? [firstParticipant, secondParticipant] : [];
    const conversationLocation = pair.length === 2 ? pair[0].districtId as DistrictId : undefined;
    const response: FrameResponse = {
      residentActions: request.residents.map((resident) => ({
        residentId: resident.id,
        action: pair.some((participant) => participant.id === resident.id) ? 'socialize' : 'continue',
        ...(pair.some((participant) => participant.id === resident.id) ? { locationId: conversationLocation } : {}),
        reason: resident.customTrait
          ? 'The custom trait is considered before the player goal.'
          : resident.playerGoal
            ? 'The player goal guides this attempt.'
            : 'Continue ordinary life.',
        planChange: '',
        priorityBasis: resident.customTrait
          ? 'custom-trait' as const
          : resident.playerGoal
            ? 'player-goal' as const
            : 'routine' as const,
        dialogue: [],
      })),
      conversations: pair.length === 2 ? [{
        id: `e2e-conversation-${frameSequence}`,
        participantIds: [pair[0].id, pair[1].id],
        locationId: conversationLocation!,
        lines: [
          { speakerId: pair[0].id, text: 'I heard the housing policy changed.' },
          { speakerId: pair[1].id, text: 'Let us see who it actually helps.' },
        ],
      }] : [],
      candidateEvents: [],
      memoryUpdates: request.selectedResidentDetail ? [{
        id: `memory-e2e-${frameSequence}`,
        residentId: request.selectedResidentDetail.residentId,
        text: 'The resident reflected on this frame.',
        importance: 40,
      }] : [],
    };
    await json(route, { data: response, usage });
  });
}
