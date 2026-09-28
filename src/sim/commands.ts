import { z } from 'zod';
import { getPreset } from './scenarios';
import type { Opportunity, Policy, WorldEvent, WorldState } from './types';

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

export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('update-era-parameter'), path: z.enum(parameterPaths), value: z.number().min(0).max(100) }),
  z.object({ type: z.literal('update-scenario-metadata'), name: z.string().min(1).max(40), description: z.string().max(240) }),
  z.object({ type: z.literal('upsert-policy'), policy: policySchema }),
  z.object({ type: z.literal('remove-policy'), policyId: z.string().min(1) }),
  z.object({ type: z.literal('create-opportunity'), opportunity: opportunitySchema }),
  z.object({ type: z.literal('apply-scenario-preset'), presetId: z.enum(['stable-modern', 'economic-downturn', 'industrial-upgrade', 'automated-future']) }),
  z.object({ type: z.literal('set-time-scale'), value: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(4)]) }),
  z.object({ type: z.literal('focus-resident'), residentId: z.string().nullable() }),
]);

export type WorldCommand = z.infer<typeof commandSchema>;
export type CommandResult = { ok: true; causalId?: string } | { ok: false; code: 'INVALID_COMMAND' | 'NOT_FOUND'; message: string };

function causalId(world: WorldState): string {
  return `cause-${world.tick}-${world.nextEventSequence + 1}`;
}

function event(world: WorldState, value: Omit<WorldEvent, 'id' | 'tick'>): void {
  world.nextEventSequence += 1;
  world.events.push({ ...value, id: `event-${world.nextEventSequence}`, tick: world.tick });
  if (world.events.length > 240) world.events.splice(0, world.events.length - 240);
}

export function applyCommand(world: WorldState, raw: unknown): CommandResult {
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
  if (command.residentId && !world.residents.some((resident) => resident.id === command.residentId)) {
    return { ok: false, code: 'NOT_FOUND', message: 'Resident not found' };
  }
  return { ok: true };
}
