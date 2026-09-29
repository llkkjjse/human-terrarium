import type { Activity, DistrictId } from '../types';
import { appendLifeLog } from './history';
import { isLocked } from './priority';
import type { ResolverContext } from './index';

const activityByAction: Partial<Record<ResolverContext['actions'][string]['action']['action'], Activity>> = {
  move: 'commute',
  work: 'work',
  rest: 'relax',
  eat: 'eat',
  socialize: 'socialize',
  seek_care: 'seek-care',
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function routineActivity(minuteOfDay: number): Activity {
  if (minuteOfDay < 420 || minuteOfDay >= 1380) return 'sleep';
  if (minuteOfDay >= 720 && minuteOfDay < 780) return 'eat';
  if (minuteOfDay >= 540 && minuteOfDay < 1020) return 'work';
  return 'relax';
}

function districtFor(activity: Activity): DistrictId {
  if (activity === 'work') return 'commerce';
  if (activity === 'socialize' || activity === 'relax') return 'commons';
  if (activity === 'seek-care') return 'municipal';
  return 'residential';
}

export function resolveRoutine(context: ResolverContext): void {
  for (const resident of context.world.residents) {
    const selected = context.actions[resident.id];
    const action = selected.action;
    const nextActivity = activityByAction[action.action] ?? routineActivity(context.world.minuteOfDay);
    if (!isLocked(context.locks, resident.id, 'activity')) resident.activity = nextActivity;
    const nextDistrict = action.locationId ?? districtFor(resident.activity);
    if (!isLocked(context.locks, resident.id, 'districtId')) resident.districtId = nextDistrict;

    const scale = Math.min(context.hours, 12);
    if (!isLocked(context.locks, resident.id, 'needs.energy')) {
      resident.needs.energy = clamp(resident.needs.energy + (resident.activity === 'sleep' ? 4 : -1.2) * scale);
    }
    if (!isLocked(context.locks, resident.id, 'needs.hunger')) {
      resident.needs.hunger = clamp(resident.needs.hunger + (resident.activity === 'eat' ? 5 : -0.8) * scale);
    }
    resident.needs.social = clamp(resident.needs.social + (resident.activity === 'socialize' ? 3 : -0.35) * scale);
    resident.needs.leisure = clamp(resident.needs.leisure + (resident.activity === 'relax' ? 2.5 : -0.25) * scale);

    appendLifeLog(context.history, context.world, {
      residentId: resident.id,
      kind: selected.overridden ? 'routine' : action.action,
      summary: `${resident.name}: ${resident.activity}`,
      detail: selected.explanation,
    });
  }
}
