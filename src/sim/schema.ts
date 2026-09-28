import { z } from 'zod';
import type { WorldStateV2 } from './types';
import { scenarioSchema } from './scenarios';

const finite = z.number().finite();
const bounded = finite.min(0).max(100);
const districtId = z.enum(['residential', 'commerce', 'commons', 'municipal']);
const role = z.enum(['supply', 'commerce', 'care', 'maintenance', 'safety', 'culture']);
const socialClass = z.enum(['precarious', 'working', 'middle', 'affluent', 'elite']);
const activity = z.enum(['idle', 'sleep', 'eat', 'work', 'socialize', 'relax', 'seek-care', 'commute']);
const eventType = z.enum(['tick', 'activity', 'dialogue', 'relationship', 'economy', 'policy', 'opportunity', 'health', 'migration', 'death', 'system']);

const memory = z.object({
  id: z.string().min(1),
  text: z.string(),
  tone: z.enum(['positive', 'neutral', 'negative']),
  tick: z.number().int().nonnegative(),
  causalId: z.string().optional(),
});

const abilities = z.object({
  strength: finite,
  dexterity: finite,
  constitution: finite,
  intelligence: finite,
  wisdom: finite,
  charisma: finite,
});

const resident = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  age: z.number().int().min(0).max(130),
  role,
  districtId,
  homeDistrictId: z.literal('residential'),
  x: finite,
  y: finite,
  income: bounded,
  savings: bounded,
  employed: z.boolean(),
  alive: z.boolean(),
  color: z.string().min(1),
  activity,
  personality: z.object({
    extraversion: bounded,
    diligence: bounded,
    agreeableness: bounded,
    curiosity: bounded,
    resilience: bounded,
  }),
  traits: z.array(z.string()),
  needs: z.object({
    hunger: bounded,
    energy: bounded,
    health: bounded,
    hygiene: bounded,
    social: bounded,
    leisure: bounded,
    safety: bounded,
    purpose: bounded,
  }),
  relationships: z.record(z.string(), bounded),
  memories: z.array(memory),
  abilities,
  customTrait: z.string(),
  finances: z.object({ cash: finite, income: finite, debt: finite }),
  appearance: z.object({ clothingQuality: bounded, conspicuousness: bounded, lowProfile: bounded }),
  assetIds: z.array(z.string().min(1)),
  realClass: socialClass,
  perceivedClass: socialClass,
  reputation: bounded,
  playerGoal: z.string(),
  personalGoal: z.string(),
  currentPlan: z.array(z.string()),
  knowledgeIds: z.array(z.string().min(1)),
  legalStatus: z.enum(['clear', 'suspect', 'wanted', 'detained', 'convicted']),
  healthConditions: z.array(z.string()),
}).passthrough();

const asset = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  kind: z.enum(['cash', 'home', 'vehicle', 'item']),
  name: z.string().min(1),
  value: finite.nonnegative(),
  visibleValue: finite.nonnegative(),
  districtId: districtId.optional(),
});

const knowledge = z.object({
  id: z.string().min(1),
  residentId: z.string().min(1),
  subjectId: z.string().min(1),
  topic: z.enum(['wealth', 'routine', 'relationship', 'event', 'reputation']),
  claim: z.string(),
  source: z.enum(['observation', 'conversation', 'work', 'public', 'investigation']),
  confidence: bounded,
  lastUpdatedTick: z.number().int().nonnegative(),
  rumor: z.boolean(),
});

const district = z.object({
  id: districtId,
  name: z.string().min(1),
  description: z.string(),
  x: finite,
  y: finite,
  width: finite.positive(),
  height: finite.positive(),
  color: z.number().int().min(0).max(0xffffff),
});

export const worldStateV2Schema: z.ZodType<WorldStateV2> = z.object({
  schemaVersion: z.literal(2),
  seed: finite,
  rngState: finite,
  tick: z.number().int().nonnegative(),
  day: z.number().int().positive(),
  minuteOfDay: z.number().int().min(0).max(1439),
  timeScale: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(4)]),
  scenario: z.custom<WorldStateV2['scenario']>((value) => scenarioSchema.safeParse(value).success),
  residents: z.array(resident).length(24),
  districts: z.array(district).min(1),
  metrics: z.object({
    vitality: bounded,
    health: bounded,
    trust: bounded,
    mobility: bounded,
    equality: bounded,
    safety: bounded,
  }),
  events: z.array(z.object({
    id: z.string().min(1),
    tick: z.number().int().nonnegative(),
    type: eventType,
    title: z.string(),
    detail: z.string(),
    residentIds: z.array(z.string()),
    causalId: z.string().optional(),
  })),
  nextEventSequence: z.number().int().nonnegative(),
  lastSavedAt: finite.nonnegative(),
  assets: z.array(asset),
  knowledge: z.array(knowledge),
  frameGranularity: z.enum(['1h', '12h', '1d']),
  queuedChanges: z.array(z.discriminatedUnion('type', [
    z.object({
      id: z.string().min(1),
      type: z.literal('absolute-event'),
      originalText: z.string(),
      payload: z.record(z.string(), z.unknown()),
    }),
    z.object({
      id: z.string().min(1),
      type: z.literal('policy'),
      originalText: z.string(),
      payload: z.record(z.string(), z.unknown()),
    }),
    z.object({
      id: z.string().min(1),
      type: z.literal('resident-edit'),
      residentId: z.string().min(1),
      payload: z.record(z.string(), z.unknown()),
    }),
  ])),
  selectedResidentId: z.string().nullable(),
  blueprint: z.object({
    schemaVersion: z.literal(2),
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    sourceText: z.string(),
    parameters: scenarioSchema.shape.parameters,
    policies: scenarioSchema.shape.policies,
    districts: z.array(district).min(1),
    social: z.object({
      inequality: bounded,
      mobility: bounded,
      trust: bounded,
      corruption: bounded,
      crimePressure: bounded,
      gossip: bounded,
    }),
  }).passthrough(),
}).passthrough().superRefine((world, context) => {
  const districtIds = new Set(world.districts.map((item) => item.id));
  const residentIds = new Set<string>();
  const assetIds = new Set<string>();
  const knowledgeIds = new Set<string>();

  world.residents.forEach((item, index) => {
    if (residentIds.has(item.id)) context.addIssue({ code: 'custom', path: ['residents', index, 'id'], message: '居民 ID 重复' });
    residentIds.add(item.id);
    if (!districtIds.has(item.districtId)) context.addIssue({ code: 'custom', path: ['residents', index, 'districtId'], message: '居民引用了不存在的区域' });
  });
  world.assets.forEach((item, index) => {
    if (assetIds.has(item.id)) context.addIssue({ code: 'custom', path: ['assets', index, 'id'], message: '资产 ID 重复' });
    assetIds.add(item.id);
    if (!residentIds.has(item.ownerId)) context.addIssue({ code: 'custom', path: ['assets', index, 'ownerId'], message: '资产所有者不存在' });
  });
  world.knowledge.forEach((item, index) => {
    if (knowledgeIds.has(item.id)) context.addIssue({ code: 'custom', path: ['knowledge', index, 'id'], message: '知识 ID 重复' });
    knowledgeIds.add(item.id);
    if (!residentIds.has(item.residentId)) context.addIssue({ code: 'custom', path: ['knowledge', index, 'residentId'], message: '知识持有人不存在' });
    if (!residentIds.has(item.subjectId)) context.addIssue({ code: 'custom', path: ['knowledge', index, 'subjectId'], message: '知识对象不存在' });
  });
  world.residents.forEach((item, index) => {
    item.assetIds.forEach((id) => {
      if (!assetIds.has(id)) context.addIssue({ code: 'custom', path: ['residents', index, 'assetIds'], message: '居民引用了不存在的资产' });
    });
    item.knowledgeIds.forEach((id) => {
      if (!knowledgeIds.has(id)) context.addIssue({ code: 'custom', path: ['residents', index, 'knowledgeIds'], message: '居民引用了不存在的知识' });
    });
  });
  if (world.selectedResidentId && !residentIds.has(world.selectedResidentId)) {
    context.addIssue({ code: 'custom', path: ['selectedResidentId'], message: '选中居民不存在' });
  }
});
