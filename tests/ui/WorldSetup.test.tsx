import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { AiClient } from '../../src/ai/client';
import { WorldSetup } from '../../src/ui/WorldSetup';
import { resolverWorld } from '../sim/resolver-fixture';

test('sends natural language and structured axes, previews 24 editable residents, then confirms', async () => {
  const generated = resolverWorld();
  const generateWorld = vi.fn(async () => ({
    data: generated,
    usage: { model: 'deepseek-flash', inputTokens: 20, outputTokens: 30, durationMs: 10, estimatedCost: 0.001 },
  }));
  const aiClient = { generateWorld } as unknown as AiClient;
  const onConfirm = vi.fn();
  render(<WorldSetup aiClient={aiClient} onConfirm={onConfirm} />);

  fireEvent.change(screen.getByLabelText('\u793e\u4f1a\u63cf\u8ff0'), {
    target: { value: '\u4e00\u4e2a\u9636\u7ea7\u5dee\u8ddd\u660e\u663e\u3001\u90bb\u91cc\u516b\u5366\u6d3b\u8dc3\u7684\u793e\u533a\u3002' },
  });
  fireEvent.change(screen.getByLabelText('\u9636\u7ea7\u5dee\u8ddd'), { target: { value: '82' } });
  fireEvent.click(screen.getByRole('button', { name: '\u751f\u6210\u793e\u4f1a' }));

  await waitFor(() => expect(generateWorld).toHaveBeenCalledOnce());
  expect(generateWorld).toHaveBeenCalledWith(expect.objectContaining({
    description: '\u4e00\u4e2a\u9636\u7ea7\u5dee\u8ddd\u660e\u663e\u3001\u90bb\u91cc\u516b\u5366\u6d3b\u8dc3\u7684\u793e\u533a\u3002',
    blueprint: expect.objectContaining({ social: expect.objectContaining({ inequality: 82 }) }),
  }));
  expect(await screen.findAllByLabelText(/\u5c45\u6c11\u59d3\u540d/)).toHaveLength(24);

  fireEvent.change(screen.getAllByLabelText(/\u5c45\u6c11\u59d3\u540d/)[0], { target: { value: '\u6797\u5c9a' } });
  fireEvent.click(screen.getByRole('button', { name: '\u786e\u8ba4\u5e76\u8fdb\u5165\u793e\u4f1a' }));

  expect(onConfirm).toHaveBeenCalledWith(
    expect.objectContaining({ residents: expect.arrayContaining([expect.objectContaining({ name: '\u6797\u5c9a' })]) }),
    expect.objectContaining({ model: 'deepseek-flash' }),
  );
});
