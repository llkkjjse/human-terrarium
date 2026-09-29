import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { Timeline } from '../../src/ui/Timeline';
import type { WorldEvent } from '../../src/sim/types';

test('hides routine and control noise but always exposes forced events and causal descendants', () => {
  const events: WorldEvent[] = [
    { id: 'routine', tick: 1, type: 'activity', title: 'Walked home', detail: 'routine', residentIds: [] },
    { id: 'control', tick: 1, type: 'system', title: 'Custom trait committed', detail: 'edit', residentIds: ['resident-01'] },
    { id: 'policy', tick: 1, type: 'policy', title: 'Housing policy', detail: 'implemented', residentIds: [] },
    {
      id: 'forced', tick: 2, type: 'system',
      title: '\u73a9\u5bb6\u5f3a\u5236\u4e8b\u4ef6: Sudden collapse',
      detail: '\u539f\u6587\uff1aThe resident collapses.\n\u76f4\u63a5\u53d8\u66f4\uff1ahealth=7',
      residentIds: ['resident-01'], causalId: 'forced-1',
    },
    { id: 'descendant', tick: 3, type: 'health', title: 'Hospital follow-up', detail: 'condition worsened', residentIds: ['resident-01'], causalId: 'forced-1' },
  ];
  render(<Timeline events={events} />);

  expect(screen.queryByText('Walked home')).not.toBeInTheDocument();
  expect(screen.queryByText('Custom trait committed')).not.toBeInTheDocument();
  expect(screen.getByText('Housing policy')).toBeInTheDocument();
  expect(screen.getByText(/Sudden collapse/)).toBeInTheDocument();
  expect(screen.getByText(/The resident collapses/)).toBeInTheDocument();
  expect(screen.getByText('Hospital follow-up')).toBeInTheDocument();
});
