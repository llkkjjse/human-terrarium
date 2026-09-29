import type { ResidentV2, SocialClass } from '../types';
import { appendLifeLog } from './history';
import type { ResolverContext } from './index';

const perceivedRank: Record<SocialClass, number> = {
  precarious: 0,
  working: 1,
  middle: 2,
  affluent: 3,
  elite: 4,
};

export function syncCashAsset(context: ResolverContext, resident: ResidentV2): void {
  const asset = context.world.assets.find((item) => item.ownerId === resident.id && item.kind === 'cash');
  if (asset) asset.value = resident.finances.cash;
}

export function visibleWealth(context: ResolverContext, resident: ResidentV2): number {
  const assets = context.world.assets
    .filter((asset) => asset.ownerId === resident.id)
    .reduce((sum, asset) => sum + asset.visibleValue, 0);
  return perceivedRank[resident.perceivedClass] * 1_000_000 + assets + resident.reputation * 100;
}

export function selectPerceivedTarget(context: ResolverContext, actor: ResidentV2): ResidentV2 | undefined {
  return context.world.residents
    .filter((candidate) => candidate.id !== actor.id && candidate.alive)
    .sort((left, right) => visibleWealth(context, right) - visibleWealth(context, left) || left.id.localeCompare(right.id))[0];
}

export function transferCash(context: ResolverContext, from: ResidentV2, to: ResidentV2, requested: number): number {
  const amount = Math.max(0, Math.min(from.finances.cash, Math.round(requested)));
  from.finances.cash -= amount;
  to.finances.cash += amount;
  syncCashAsset(context, from);
  syncCashAsset(context, to);
  return amount;
}

export function resolveEconomy(context: ResolverContext): void {
  for (const resident of context.world.residents) {
    const action = context.actions[resident.id].action;
    if (action.action === 'work' && resident.employed) {
      const pay = Math.max(0, Math.round(resident.finances.income * context.hours / 160));
      resident.finances.cash += pay;
      syncCashAsset(context, resident);
      appendLifeLog(context.history, context.world, {
        residentId: resident.id,
        kind: 'income',
        summary: `${resident.name} earned income`,
        detail: `Earned ${pay} during this frame.`,
      });
    }
    if (action.action === 'eat') {
      const cost = Math.min(resident.finances.cash, Math.max(1, Math.round(12 * context.hours)));
      resident.finances.cash -= cost;
      syncCashAsset(context, resident);
    }
    if (action.action === 'select_target_for_fraud') {
      const target = action.targetId
        ? context.world.residents.find((candidate) => candidate.id === action.targetId)
        : selectPerceivedTarget(context, resident);
      if (target) {
        resident.currentPlan = [`Approach ${target.id}, who appears wealthy.`];
        appendLifeLog(context.history, context.world, {
          residentId: resident.id,
          kind: 'planning',
          summary: `${resident.name} selected a perceived target`,
          detail: `Selected ${target.id} using visible and rumored wealth only.`,
        });
      }
    }
  }
}
