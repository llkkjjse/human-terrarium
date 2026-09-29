import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { AiClient } from '../../src/ai/client';
import { ResidentLens } from '../../src/ui/ResidentLens';
import { resolverWorld } from '../sim/resolver-fixture';

function dependencies() {
  return {
    runtime: { dispatch: vi.fn(async () => ({ ok: true as const })) },
    aiClient: {
      parseAbsoluteEvent: vi.fn(async ({ text, residentId }) => ({
        data: { id: 'forced-1', originalText: text, payload: { residentId, set: { 'needs.health': 12 } } },
        usage: { model: 'deepseek-flash', inputTokens: 1, outputTokens: 1, durationMs: 1, estimatedCost: 0 },
      })),
    } as unknown as AiClient,
    historyStore: {
      listLifeLogs: vi.fn(async ({ offset }: { offset: number }) => offset === 0
        ? Array.from({ length: 20 }, (_, index) => ({
          id: `log-${index}`,
          worldId: 'resolver-world',
          residentId: 'resident-01',
          tick: 30 - index,
          kind: 'routine',
          summary: `life-${index}`,
          detail: `detail-${index}`,
        }))
        : [{ id: 'oldest', worldId: 'resolver-world', residentId: 'resident-01', tick: 1, kind: 'work', summary: 'oldest life', detail: 'kept forever' }]),
      listConversations: vi.fn(async () => [{
        id: 'dialogue-1',
        worldId: 'resolver-world',
        tick: 2,
        participantIds: ['resident-01', 'resident-02'],
        locationId: 'commons',
        text: 'resident-01: full line one\nresident-02: full line two',
      }]),
    },
  };
}

describe('resident observation lens', () => {
  test('keeps custom trait separate, verbatim, and allows edited abilities above 20', async () => {
    const world = resolverWorld();
    const resident = world.residents[0];
    expect(resident.customTrait).toBe('');
    const props = dependencies();
    render(<ResidentLens world={world} resident={resident} {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Traits & abilities' }));
    const personality = screen.getByLabelText('Generated personality');
    expect(within(personality).getByText(/extraversion/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Custom trait')).toHaveValue('');

    const exactTrait = '  Never lies.  ';
    fireEvent.change(screen.getByLabelText('Custom trait'), { target: { value: exactTrait } });
    fireEvent.change(screen.getByLabelText('Strength'), { target: { value: '37' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save resident edits' }));

    await waitFor(() => expect(props.runtime.dispatch).toHaveBeenCalledTimes(2));
    expect(props.runtime.dispatch).toHaveBeenCalledWith({
      type: 'set-custom-trait', residentId: resident.id, trait: exactTrait,
    });
    expect(props.runtime.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'edit-resident',
      patch: expect.objectContaining({ abilities: expect.objectContaining({ strength: 37 }) }),
    }));
  });

  test('pages permanent life history and shows complete dialogue text', async () => {
    const world = resolverWorld();
    const props = dependencies();
    render(<ResidentLens world={world} resident={world.residents[0]} {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Life history' }));
    expect(await screen.findByText('life-0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load older' }));
    expect(await screen.findByText('oldest life')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Conversations' }));
    expect(await screen.findByText(/full line one/)).toHaveTextContent('full line two');
  });
});
