import { nextRandom } from './rng';
import type { Activity, District, DistrictId, Needs, Personality, Resident, Role, WorldScenario, WorldState } from './types';

export { createGeneratedWorld, deriveSocialClass } from './generation';

const roles: Role[] = ['supply', 'commerce', 'care', 'maintenance', 'safety', 'culture'];
const names = ['陈晨', '林溪', '周遥', '许宁', '韩星', '沈嘉', '陆原', '唐雨', '顾川', '叶青', '苏禾', '秦安', '江澄', '罗夏', '温言', '程野', '方圆', '乔木', '白露', '何夕', '杜若', '孟秋', '袁朗', '夏竹'];
const colors = ['#f3a683', '#f7d794', '#778beb', '#e77f67', '#cf6a87', '#63cdda', '#ea8685', '#596275'];

export const districts: District[] = [
  { id: 'residential', name: '栖居里', description: '住宅、厨房与安静的小巷。', x: 0, y: 0, width: 720, height: 480, color: 0xd9b48f },
  { id: 'commerce', name: '新业街', description: '办公室、商店、餐馆与诊所。', x: 720, y: 0, width: 720, height: 480, color: 0x8fa7bd },
  { id: 'commons', name: '榕荫园', description: '公园、广场与社区活动空间。', x: 0, y: 480, width: 720, height: 480, color: 0x8faf87 },
  { id: 'municipal', name: '城事边廊', description: '仓储、维修、能源与社区入口。', x: 720, y: 480, width: 720, height: 480, color: 0xb49b82 },
];

function randomValue(worldSeed: { value: number }, min: number, max: number): number {
  const result = nextRandom(worldSeed.value);
  worldSeed.value = result.state;
  return Math.round(min + result.value * (max - min));
}

function createPersonality(seed: { value: number }): Personality {
  return {
    extraversion: randomValue(seed, 20, 90),
    diligence: randomValue(seed, 25, 92),
    agreeableness: randomValue(seed, 25, 90),
    curiosity: randomValue(seed, 20, 94),
    resilience: randomValue(seed, 25, 90),
  };
}

function createNeeds(): Needs {
  return { hunger: 76, energy: 82, health: 88, hygiene: 80, social: 68, leisure: 64, safety: 84, purpose: 72 };
}

function createResident(index: number, seed: { value: number }): Resident {
  const role = roles[index % roles.length];
  const workDistrict: DistrictId = role === 'culture' ? 'commons' : role === 'maintenance' || role === 'safety' ? 'municipal' : 'commerce';
  return {
    id: `resident-${String(index + 1).padStart(2, '0')}`,
    name: names[index],
    age: randomValue(seed, 20, 58),
    role,
    districtId: index < 12 ? 'residential' : workDistrict,
    homeDistrictId: 'residential',
    x: randomValue(seed, 80, 1360),
    y: randomValue(seed, 90, 870),
    income: randomValue(seed, 45, 82),
    savings: randomValue(seed, 25, 85),
    employed: true,
    alive: true,
    color: colors[index % colors.length],
    activity: 'idle',
    personality: createPersonality(seed),
    traits: index % 3 === 0 ? ['健谈', '早起'] : index % 3 === 1 ? ['细心', '念旧'] : ['好奇', '夜猫子'],
    needs: createNeeds(),
    relationships: {},
    memories: [],
  };
}

export function createWorld(input: { seed: number; scenario: WorldScenario }): WorldState {
  const randomSeed = { value: input.seed || 0x9e3779b9 };
  const residents = names.map((_, index) => createResident(index, randomSeed));
  residents.forEach((resident, index) => {
    const neighbor = residents[(index + 1) % residents.length];
    resident.relationships[neighbor.id] = 45 + (index % 4) * 8;
  });
  return {
    schemaVersion: 1,
    seed: input.seed,
    rngState: randomSeed.value,
    tick: 0,
    day: 1,
    minuteOfDay: 7 * 60,
    timeScale: 1,
    scenario: structuredClone(input.scenario),
    districts: structuredClone(districts),
    residents,
    metrics: { vitality: 68, health: 76, trust: 62, mobility: 56, equality: 58, safety: 78 },
    events: [],
    nextEventSequence: 0,
    lastSavedAt: Date.now(),
  };
}

function chooseActivity(resident: Resident, minuteOfDay: number): Activity {
  if (resident.needs.health < 25) return 'seek-care';
  if (resident.needs.energy < 24 || minuteOfDay < 360 || minuteOfDay > 1380) return 'sleep';
  if (resident.needs.hunger < 28) return 'eat';
  const socialScore = (100 - resident.needs.social) * 0.8 + resident.personality.extraversion * 0.8;
  const workScore = (100 - resident.needs.purpose) * 0.5 + resident.personality.diligence * 0.8 + (resident.employed ? 10 : 0);
  const leisureScore = (100 - resident.needs.leisure) * 0.7 + resident.personality.curiosity * 0.3;
  if (socialScore >= workScore && socialScore >= leisureScore) return 'socialize';
  if (workScore >= leisureScore) return 'work';
  return 'relax';
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function updateNeeds(resident: Resident): void {
  resident.needs.hunger = clamp(resident.needs.hunger - 0.45);
  resident.needs.energy = clamp(resident.needs.energy - 0.25);
  resident.needs.social = clamp(resident.needs.social - 0.2);
  resident.needs.leisure = clamp(resident.needs.leisure - 0.16);
  resident.needs.purpose = clamp(resident.needs.purpose - 0.12);
  if (resident.activity === 'eat') resident.needs.hunger = clamp(resident.needs.hunger + 18);
  if (resident.activity === 'sleep') resident.needs.energy = clamp(resident.needs.energy + 12);
  if (resident.activity === 'socialize') resident.needs.social = clamp(resident.needs.social + 9);
  if (resident.activity === 'relax') resident.needs.leisure = clamp(resident.needs.leisure + 7);
  if (resident.activity === 'work') resident.needs.purpose = clamp(resident.needs.purpose + 4);
}

function targetDistrict(activity: Activity, resident: Resident): DistrictId {
  if (activity === 'sleep' || activity === 'eat') return 'residential';
  if (activity === 'socialize' || activity === 'relax') return 'commons';
  if (activity === 'seek-care') return 'commerce';
  if (activity === 'work') {
    if (resident.role === 'culture') return 'commons';
    if (resident.role === 'maintenance' || resident.role === 'safety') return 'municipal';
    return 'commerce';
  }
  return resident.districtId;
}

function addEvent(world: WorldState, event: Omit<WorldState['events'][number], 'id' | 'tick'>): void {
  world.nextEventSequence += 1;
  world.events.push({ ...event, id: `event-${world.nextEventSequence}`, tick: world.tick });
  if (world.events.length > 240) world.events.splice(0, world.events.length - 240);
}

function effectiveValue(world: WorldState, path: string, baseValue: number): number {
  const policyDelta = world.scenario.policies
    .filter((policy) => policy.enabled)
    .flatMap((policy) => policy.modifiers.map((modifier) => ({ ...modifier, intensity: policy.intensity })))
    .filter((modifier) => modifier.path === path)
    .reduce((total, modifier) => total + modifier.delta * modifier.intensity / 100, 0);
  return clamp(baseValue + policyDelta);
}

const automationExposure: Record<Role, number> = {
  supply: 0.85,
  commerce: 0.65,
  care: 0.2,
  maintenance: 0.45,
  safety: 0.25,
  culture: 0.35,
};

function updateEmployment(world: WorldState, resident: Resident): void {
  if (world.tick % 32 !== 0) return;
  const { economy, institutions, technology } = world.scenario.parameters;
  const unemployment = effectiveValue(world, 'economy.unemployment', economy.unemployment);
  const prosperity = effectiveValue(world, 'economy.prosperity', economy.prosperity);
  const protection = effectiveValue(world, 'institutions.laborProtection', institutions.laborProtection);
  const random = nextRandom(world.rngState);
  world.rngState = random.state;

  if (resident.employed) {
    const pressure = unemployment * 0.65
      + technology.automation * automationExposure[resident.role] * 0.35
      - protection * 0.35
      - resident.personality.resilience * 0.2
      - prosperity * 0.15;
    if (random.value < Math.max(0, pressure) / 250) {
      resident.employed = false;
      resident.memories.push({
        id: `memory-${resident.id}-${world.tick}`,
        text: '岗位发生变化，开始重新寻找生活的落点。',
        tone: 'negative',
        tick: world.tick,
      });
      addEvent(world, {
        type: 'economy',
        title: `${resident.name} 暂时失去工作`,
        detail: '失业、自动化与劳动保障共同改变了这份工作的稳定性。',
        residentIds: [resident.id],
      });
    }
    return;
  }

  const reemploymentChance = (
    (100 - unemployment) * 0.25
    + institutions.education * 0.12
    + prosperity * 0.15
    + resident.personality.curiosity * 0.08
  ) / 100;
  if (random.value < reemploymentChance) {
    resident.employed = true;
    resident.memories.push({
      id: `memory-${resident.id}-${world.tick}`,
      text: '找到了一份新的工作，生活重新有了节奏。',
      tone: 'positive',
      tick: world.tick,
    });
    addEvent(world, {
      type: 'economy',
      title: `${resident.name} 找到新工作`,
      detail: '教育、经济活力与个人适应力促成了这次机会。',
      residentIds: [resident.id],
    });
  }
}

function updateResidentEraEffects(world: WorldState, resident: Resident): void {
  const { economy, institutions, technology, culture, environment } = world.scenario.parameters;
  const prosperity = effectiveValue(world, 'economy.prosperity', economy.prosperity);
  const wages = effectiveValue(world, 'economy.wages', economy.wages);
  const prices = effectiveValue(world, 'economy.prices', economy.prices);
  const housing = effectiveValue(world, 'economy.housingPressure', economy.housingPressure);
  const welfare = effectiveValue(world, 'institutions.welfare', institutions.welfare);
  const healthcare = effectiveValue(world, 'institutions.healthcare', institutions.healthcare);
  const publicSafety = effectiveValue(world, 'institutions.publicSafety', institutions.publicSafety);

  const targetIncome = resident.employed
    ? wages * 0.62 + prosperity * 0.25 + resident.personality.diligence * 0.13
    : welfare * 0.42;
  resident.income = clamp(resident.income + (targetIncome - resident.income) * 0.025);

  const disposablePressure = resident.income + welfare * 0.16 - prices * 0.3 - housing * 0.24;
  resident.savings = clamp(resident.savings + disposablePressure / 600);

  const healthTarget = healthcare * 0.35
    + technology.medicine * 0.25
    + environment.supply * 0.18
    + resident.personality.resilience * 0.12
    + (100 - environment.pollution) * 0.1
    - environment.epidemicRisk * 0.08;
  resident.needs.health = clamp(resident.needs.health + (healthTarget - resident.needs.health) * 0.006);

  const safetyTarget = publicSafety * 0.7
    + (100 - environment.disasterRisk) * 0.2
    + resident.personality.resilience * 0.1;
  resident.needs.safety = clamp(resident.needs.safety + (safetyTarget - resident.needs.safety) * 0.01);

  const purposeTarget = resident.employed
    ? culture.workEthic * 0.45 + prosperity * 0.25 + resident.personality.diligence * 0.3
    : welfare * 0.35 + resident.personality.resilience * 0.3 + culture.openness * 0.2;
  resident.needs.purpose = clamp(resident.needs.purpose + (purposeTarget - resident.needs.purpose) * 0.008);
}

function updateMetrics(world: WorldState): void {
  const { parameters } = world.scenario;
  const welfare = effectiveValue(world, 'institutions.welfare', parameters.institutions.welfare);
  const prosperity = effectiveValue(world, 'economy.prosperity', parameters.economy.prosperity);
  const inequality = effectiveValue(world, 'economy.inequality', parameters.economy.inequality);
  const housing = effectiveValue(world, 'economy.housingPressure', parameters.economy.housingPressure);
  const healthcare = effectiveValue(world, 'institutions.healthcare', parameters.institutions.healthcare);
  const safety = effectiveValue(world, 'institutions.publicSafety', parameters.institutions.publicSafety);
  const averageHealth = world.residents.filter((resident) => resident.alive).reduce((sum, resident) => sum + resident.needs.health, 0) / Math.max(1, world.residents.filter((resident) => resident.alive).length);
  const targets = {
    vitality: prosperity * 0.7 + parameters.technology.productivity * 0.3,
    health: averageHealth * 0.5 + healthcare * 0.3 + parameters.technology.medicine * 0.2 - parameters.environment.pollution * 0.08,
    trust: parameters.culture.socialTrust * 0.65 + welfare * 0.2 + (100 - inequality) * 0.15,
    mobility: parameters.institutions.education * 0.35 + prosperity * 0.35 + (100 - inequality) * 0.3,
    equality: (100 - inequality) * 0.5 + welfare * 0.35 + (100 - housing) * 0.15,
    safety: safety * 0.7 + (100 - parameters.environment.disasterRisk) * 0.3,
  };
  for (const key of Object.keys(targets) as Array<keyof typeof targets>) {
    world.metrics[key] = clamp(world.metrics[key] + (targets[key] - world.metrics[key]) * 0.08);
  }
}

function opportunityTargets(world: WorldState, target: string): Resident[] {
  if (target === 'everyone') return world.residents.filter((resident) => resident.alive);
  return world.residents.filter((resident) => resident.alive && (resident.role === target || resident.districtId === target));
}

function updateOpportunities(world: WorldState): void {
  for (const opportunity of world.scenario.opportunities) {
    for (const resident of opportunityTargets(world, opportunity.target)) {
      resident.savings = clamp(resident.savings + opportunity.prosperityBoost / 40);
      resident.needs.purpose = clamp(resident.needs.purpose + Math.max(0, opportunity.prosperityBoost) / 50);
    }
    opportunity.remainingTicks -= 1;
  }
  const expired = world.scenario.opportunities.filter((opportunity) => opportunity.remainingTicks <= 0);
  world.scenario.opportunities = world.scenario.opportunities.filter((opportunity) => opportunity.remainingTicks > 0);
  for (const opportunity of expired) {
    addEvent(world, { type: 'opportunity', title: '机遇窗口结束', detail: opportunity.name, residentIds: [], causalId: opportunity.causalId });
  }
}

function updateSocialLife(world: WorldState): void {
  if (world.tick % 4 !== 0) return;
  const socialResidents = world.residents.filter((resident) => resident.alive && resident.activity === 'socialize');
  for (let index = 0; index + 1 < socialResidents.length; index += 2) {
    const speaker = socialResidents[index];
    const listener = socialResidents[index + 1];
    if (speaker.districtId !== listener.districtId) continue;
    const random = nextRandom(world.rngState);
    world.rngState = random.state;
    const chance = (speaker.personality.extraversion + listener.personality.extraversion) / 240;
    if (random.value > chance) continue;
    const oldRelationship = speaker.relationships[listener.id] ?? 0;
    const gain = 1 + Math.round((speaker.personality.agreeableness + listener.personality.agreeableness) / 80);
    speaker.relationships[listener.id] = clamp(oldRelationship + gain);
    listener.relationships[speaker.id] = clamp((listener.relationships[speaker.id] ?? 0) + gain);
    const lines = ['聊起了最近的工作和生活。', '交换了对社区变化的看法。', '在路边停下来问候彼此。'];
    addEvent(world, {
      type: 'dialogue', title: `${speaker.name} 与 ${listener.name} 交谈`, detail: lines[world.tick % lines.length],
      residentIds: [speaker.id, listener.id],
    });
  }
}

function updateMigration(world: WorldState): void {
  if (world.tick % 32 !== 0) return;
  const alive = world.residents.filter((resident) => resident.alive);
  if (alive.length >= 24 || world.scenario.parameters.economy.prosperity < 40) return;
  const roleCounts = new Map<Role, number>(roles.map((role) => [role, alive.filter((resident) => resident.role === role).length]));
  const role = roles.reduce((least, candidate) => (roleCounts.get(candidate)! < roleCounts.get(least)! ? candidate : least), roles[0]);
  const template = structuredClone(alive[0] ?? world.residents[0]);
  const sequence = world.residents.length + 1;
  const randomAge = nextRandom(world.rngState);
  const randomPosition = nextRandom(randomAge.state);
  world.rngState = randomPosition.state;
  const newcomer: Resident = {
    ...template,
    id: `migrant-${world.day}-${sequence}`,
    name: `新居民${sequence}`,
    age: 20 + Math.floor(randomAge.value * 24),
    role,
    districtId: 'residential',
    x: 120 + randomPosition.value * 480,
    y: 210,
    employed: true,
    alive: true,
    activity: 'idle',
    relationships: {},
    memories: [{ id: `memory-${world.tick}`, text: '刚刚搬进这座社区。', tone: 'neutral', tick: world.tick }],
    needs: createNeeds(),
  };
  world.residents.push(newcomer);
  addEvent(world, { type: 'migration', title: `${newcomer.name} 迁入社区`, detail: `带着${roles.indexOf(role) >= 0 ? role : '新的'}技能开始生活。`, residentIds: [newcomer.id] });
}

export function stepWorld(world: WorldState): WorldState {
  world.tick += 1;
  world.minuteOfDay += 15;
  if (world.minuteOfDay >= 1440) {
    world.day += 1;
    world.minuteOfDay -= 1440;
  }
  for (const resident of world.residents) {
    if (!resident.alive) continue;
    if (resident.needs.health <= 0 && resident.needs.hunger <= 0) {
      resident.alive = false;
      resident.activity = 'idle';
      addEvent(world, { type: 'death', title: `${resident.name} 离世`, detail: '长期的健康与生存压力最终超过了承受能力。', residentIds: [resident.id] });
      continue;
    }
    resident.activity = chooseActivity(resident, world.minuteOfDay);
    resident.districtId = targetDistrict(resident.activity, resident);
    const district = world.districts.find((item) => item.id === resident.districtId)!;
    const randomX = nextRandom(world.rngState);
    const randomY = nextRandom(randomX.state);
    world.rngState = randomY.state;
    resident.x += ((district.x + 40 + randomX.value * (district.width - 80)) - resident.x) * 0.09;
    resident.y += ((district.y + 50 + randomY.value * (district.height - 100)) - resident.y) * 0.09;
    updateNeeds(resident);
    updateEmployment(world, resident);
    updateResidentEraEffects(world, resident);
    if (resident.needs.hunger < 10 || resident.needs.energy < 5) resident.needs.health = clamp(resident.needs.health - 0.6);
  }
  updateOpportunities(world);
  updateSocialLife(world);
  updateMetrics(world);
  updateMigration(world);
  return world;
}
