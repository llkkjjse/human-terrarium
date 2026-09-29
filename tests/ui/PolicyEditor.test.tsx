import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { AiClient } from '../../src/ai/client';
import { PolicyEditor } from '../../src/ui/PolicyEditor';

test('drafting does not touch the timeline and formal implementation creates one command', async () => {
  const compilePolicy = vi.fn(async () => ({
    data: {
      id: 'housing-first',
      name: '\u4f4f\u623f\u4f18\u5148',
      description: '\u4e3a\u65e0\u623f\u5c45\u6c11\u63d0\u4f9b\u8865\u8d34\u3002',
      enabled: true,
      intensity: 70,
      modifiers: [{ path: 'economy.housingPressure', delta: -15 }],
    },
    usage: { model: 'deepseek-flash', inputTokens: 20, outputTokens: 20, durationMs: 15, estimatedCost: 0.001 },
  }));
  const dispatch = vi.fn(async () => ({ ok: true as const, causalId: 'cause-policy' }));
  render(
    <PolicyEditor
      aiClient={{ compilePolicy } as unknown as AiClient}
      runtime={{ dispatch }}
      worldId="policy-world"
    />,
  );

  const draft = '\u4e3a\u8eab\u65e0\u5206\u6587\u7684\u5c45\u6c11\u63d0\u4f9b\u4f4f\u623f\u8865\u8d34\u3002';
  fireEvent.change(screen.getByLabelText('\u81ea\u7136\u8bed\u8a00\u653f\u7b56'), { target: { value: draft } });
  fireEvent.change(screen.getByLabelText('\u653f\u7b56\u5f3a\u5ea6'), { target: { value: '70' } });
  expect(dispatch).not.toHaveBeenCalled();
  expect(compilePolicy).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: '\u6b63\u5f0f\u5b9e\u65bd\u653f\u7b56' }));
  await waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
  expect(compilePolicy).toHaveBeenCalledWith({
    text: `${draft}\n\u653f\u7b56\u5f3a\u5ea6\uff1a70`,
    worldId: 'policy-world',
  });
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'implement-policy', originalText: draft }));
  expect(screen.getByLabelText('\u81ea\u7136\u8bed\u8a00\u653f\u7b56')).toHaveValue(draft);
});
