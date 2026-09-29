import { z } from 'zod';
import { getPreset } from './scenarios';
import type { Opportunity, Policy, QueuedWorldChange, WorldEvent, WorldState, WorldStateV2 } from './types';

const parameterPaths = [
  'economy.prosperity', 'economy.prices', 'economy.wages', 'economy.housingPressure', 'economy.unemployment', 'economy.inequality',
  'institutions.taxBurden', 'institutions.welfare', 'institutions.healthcare', 'institutions.education', 'institutions.laborProtection', 'institutions.publicSafety',
  'technology.automation', 'technology.information', 'technology.medicine', 'technology.transport', 'technology.productivity',
  'culture.familyOrientation', 'culture.workEthic', 'culture.consumption', 'culture.openness', 'culture.socialTrust',
  'environment.supply', 'environment.pollution', 'environment.climatePressure', 'environment.disasterRisk', 'environment.epidemicRisk',
] as const;

const policySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  description: z.string().max(180),
  enabled: z.boolean(),
  intensity: z.number().min(0).max(100),
  modifiers: z.array(z.object({ path: z.enum(parameterPaths), delta: z.number().min(-100).max(100) })).max(12),
});

const opportunitySchema = z.object({
  name: z.string().min(1).max(40),
  target: z.enum(['residential', 'commerce', 'commons', 'municipal', 'supply', 'care', 'maintenance', 'safety', 'culture', 'everyone']),
  durationTicks: z.number().int().min(1).max(672),
  prosperityBoost: z.number().min(-50).max(50),
});

const abilityEditSchema = z.object({
  strength: z.number().finite().optional(),
  dexterity: z.number().finite().optional(),
  constitution: z.number().finite().optional(),
  intelligence: z.number().finite().optional(),
  wisdom: z.number().finite().optional(),
  charisma: z.number().finite().optional(),
}).partial();

const residentEditSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  age: z.number().int().min(0).max(130).optional(),
  abilities: abilityEditSchema.optional(),
  finances: z.object({
    cash: z.number().finite().optional(),
    income: z.number().finite().optional(),
    debt: z.number().finite().optional(),
  }).partial().optional(),
  appearance: z.object({
    clothingQuality: z.number().finite().min(0).max(100).optional(),
    conspicuousness: z.number().finite().min(0).max(100).optional(),
    lowProfile: z.number().finite().min(0).max(100).optional(),
  }).partial().optional(),
});

export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('update-era-parameter'), path: z.enum(parameterPaths), value: z.number().min(0).max(100) }),
  z.object({ type: z.literal('update-scenario-metadata'), name: z.string().min(1).max(40), description: z.string().max(240) }),
  z.object({ type: z.literal('upsert-policy'), policy: policySchema }),
  z.object({ type: z.literal('remove-policy'), policyId: z.string().min(1) }),
  z.object({ type: z.literal('create-opportunity'), opportunity: opportunitySchema }),
  z.object({ type: z.literal('apply-scenario-preset'), presetId: z.enum(['stable-modern', 'economic-downturn', 'industrial-upgrade', 'automated-future']) }),
  z.object({ type: z.literal('set-time-scale'), value: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(4)]) }),
  z.object({ type: z.literal('focus-resident'), residentId: z.string().nullable() }),
  z.object({ type: z.literal('set-personal-goal'), residentId: z.string().min(1), goal: z.string().max(1_000) }),
  z.object({ type: z.literal('set-custom-trait'), residentId: z.string().min(1), trait: z.string().max(1_000) }),
  z.object({ type: z.literal('edit-resident'), residentId: z.string().min(1), patch: residentEditSchema }),
  z.object({
    type: z.literal('queue-absolute-event'),
    event: z.object({
      id: z.string().min(1),
      originalText: z.string().min(1),
      payload: z.record(z.string(), z.unknown()),
    }),
    residentId: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal('implement-policy'),
    originalText: z.string().min(1),
    policy: policySchema,
  }),
]);

export type WorldCommand = z.infer<typeof commandSchema>;
export type CommandResult = { ok: true; causalId?: string } | { ok: false; code: 'INVALID_COMMAND' | 'NOT_FOUND'; message: string };

type MutableWorld = WorldState | WorldStateV2;

function isV2(world: MutableWorld): world is WorldStateV2 {
  return world.schemaVersion === 2;
}

function causalId(world: MutableWorld): string {
  return `cause-${world.tick}-${world.nextEventSequence + 1}`;
}

function event(world: MutableWorld, value: Omit<WorldEvent, 'id' | 'tick'>): void {
  world.nextEventSequence += 1;
  world.events.push({ ...value, id: `event-${world.nextEventSequence}`, tick: world.tick });
  if (world.events.length > 240) world.events.splice(0, world.events.length - 240);
}

function queueChange(world: WorldStateV2, change: QueuedWorldChange): void {
  const index = world.queuedChanges.findIndex((item) => item.id === change.id);
  if (index >= 0) world.queuedChanges[index] = change;
  else world.queuedChanges.push(change);
}

export function applyCommand(world: MutableWorld, raw: unknown): CommandResult {
  const parsed = commandSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: 'INVALID_COMMAND', message: parsed.error.issues[0]?.message ?? 'Invalid command' };
  const command = parsed.data;
  if (command.type === 'update-era-parameter') {
    const id = causalId(world);
    const [group, key] = command.path.split('.') as [keyof typeof world.scenario.parameters, string];
    const record = world.scenario.parameters[group] as unknown as Record<string, number>;
    record[key] = command.value;
    if (world.scenario.id !== 'custom') {
      world.scenario.name = `自定义 · ${world.scenario.name}`;
      world.scenario.id = 'custom';
      world.scenario.baseline = 'custom';
    }
    event(world, {
      type: 'economy', title: '时代参数发生变化', detail: `${command.path} 调整为 ${command.value}`, residentIds: [], causalId: id,
    });
    return { ok: true, causalId: id };
  }
  if (command.type === 'update-scenario-metadata') {
    world.scenario.id = 'custom';
    world.scenario.baseline = 'custom';
    world.scenario.name = command.name;
    world.scenario.description = command.description;
    return { ok: true };
  }
  if (command.type === 'upsert-policy') {
    const id = causalId(world);
    const next = structuredClone(command.policy) as Policy;
    const index = world.scenario.policies.findIndex((policy) => policy.id === next.id);
    if (index >= 0) world.scenario.policies[index] = next;
    else world.scenario.policies.push(next);
    event(world, { type: 'policy', title: next.enabled ? '政策已启用' : '政策已保存', detail: next.name, residentIds: [], causalId: id });
    return { ok: true, causalId: id };
  }
  if (command.type === 'remove-policy') {
    const index = world.scenario.policies.findIndex((policy) => policy.id === command.policyId);
    if (index < 0) return { ok: false, code: 'NOT_FOUND', message: 'Policy not found' };
    world.scenario.policies.splice(index, 1);
    return { ok: true };
  }
  if (command.type === 'create-opportunity') {
    const id = causalId(world);
    const opportunity: Opportunity = {
      id: `opportunity-${world.tick}-${world.scenario.opportunities.length + 1}`,
      name: command.opportunity.name,
      target: command.opportunity.target,
      remainingTicks: command.opportunity.durationTicks,
      prosperityBoost: command.opportunity.prosperityBoost,
      causalId: id,
    };
    world.scenario.opportunities.push(opportunity);
    event(world, { type: 'opportunity', title: '新的社会机遇', detail: opportunity.name, residentIds: [], causalId: id });
    return { ok: true, causalId: id };
  }
  if (command.type === 'apply-scenario-preset') {
    const id = causalId(world);
    world.scenario = getPreset(command.presetId);
    event(world, {
      type: 'system',
      title: '时代背景已切换',
      detail: `社区进入“${world.scenario.name}”，居民与既有历史继续演进。`,
      residentIds: [],
      causalId: id,
    });
    return { ok: true, causalId: id };
  }
  if (command.type === 'set-time-scale') {
    world.timeScale = command.value;
    return { ok: true };
  }
  if ('residentId' in command && command.residentId && !world.residents.some((resident) => resident.id === command.residentId)) {
    return { ok: false, code: 'NOT_FOUND', message: 'Resident not found' };
  }
  if (command.type === 'focus-resident') {
    if (isV2(world)) world.selectedResidentId = command.residentId;
    return { ok: true };
  }
  if (command.type === 'set-personal-goal' || command.type === 'set-custom-trait' || command.type === 'edit-resident') {
    if (!isV2(world)) {
      return { ok: false, code: 'INVALID_COMMAND', message: 'This intervention requires a v2 AI world.' };
    }
    const id = causalId(world);
    const payload = command.type === 'set-personal-goal'
      ? { playerGoal: command.goal }
      : command.type === 'set-custom-trait'
        ? { customTrait: command.trait }
        : command.patch;
    queueChange(world, {
      id: `change-${id}`,
      type: 'resident-edit',
      residentId: command.residentId,
      payload: structuredClone(payload),
    });
    event(world, {
      type: 'system',
      title: command.type === 'set-personal-goal'
        ? 'Player goal committed'
        : command.type === 'set-custom-trait'
          ? 'Custom trait committed'
          : 'Resident edit committed',
      detail: command.type === 'set-personal-goal'
        ? command.goal
        : command.type === 'set-custom-trait'
          ? command.trait
          : 'The player committed a resident data edit.',
      residentIds: [command.residentId],
      causalId: id,
    });
    return { ok: true, causalId: id };
  }
  if (command.type === 'queue-absolute-event') {
    if (!isV2(world)) {
      return { ok: false, code: 'INVALID_COMMAND', message: 'This intervention requires a v2 AI world.' };
    }
    queueChange(world, {
      ...structuredClone(command.event),
      type: 'absolute-event',
      payload: {
        ...structuredClone(command.event.payload),
        ...(command.residentId ? { residentId: command.residentId } : {}),
      },
    });
    return { ok: true, causalId: command.event.id };
  }
  if (command.type === 'implement-policy') {
    if (!isV2(world)) {
      return { ok: false, code: 'INVALID_COMMAND', message: 'This intervention requires a v2 AI world.' };
    }
    const id = causalId(world);
    queueChange(world, {
      id: `change-${id}`,
      type: 'policy',
      originalText: command.originalText,
      payload: { policy: structuredClone(command.policy) },
    });
    event(world, {
      type: 'policy',
      title: 'Policy implementation committed',
      detail: command.policy.name,
      residentIds: [],
      causalId: id,
    });
    return { ok: true, causalId: id };
  }
  return { ok: true };
}
