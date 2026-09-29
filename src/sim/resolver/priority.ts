import type { ResidentAction } from '../../ai/contracts';
import type { ResidentV2 } from '../types';

export interface PrioritizedAction {
  action: ResidentAction;
  overridden: boolean;
  explanation: string;
}

export function prioritizeAction(resident: ResidentV2, proposed: ResidentAction): PrioritizedAction {
  const required = resident.customTrait.trim()
    ? 'custom-trait'
    : resident.playerGoal.trim()
      ? 'player-goal'
      : null;
  if (!required || proposed.priorityBasis === required) {
    return { action: proposed, overridden: false, explanation: proposed.reason };
  }
  return {
    action: {
      residentId: resident.id,
      action: 'continue',
      reason: `Proposed action was overridden because ${required === 'custom-trait' ? 'the custom trait' : 'the player goal'} has higher priority.`,
      planChange: '',
      priorityBasis: required,
      dialogue: [],
    },
    overridden: true,
    explanation: `Ignored ${proposed.action}; ${required === 'custom-trait' ? 'custom trait' : 'player goal'} takes priority.`,
  };
}

export function isLocked(locks: Record<string, string[]>, residentId: string, path: string): boolean {
  const residentLocks = locks[residentId] ?? [];
  return residentLocks.some((locked) => locked === path || path.startsWith(`${locked}.`) || locked.startsWith(`${path}.`));
}
