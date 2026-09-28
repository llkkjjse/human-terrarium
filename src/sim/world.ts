import { nextRandom } from './rng';
import type { Activity, District, DistrictId, Needs, Personality, Resident, Role, WorldScenario, WorldState } from './types';

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

export function stepWorld(world: WorldState): WorldState {
  world.tick += 1;
  world.minuteOfDay += 15;
  if (world.minuteOfDay >= 1440) {
    world.day += 1;
    world.minuteOfDay -= 1440;
  }
  for (const resident of world.residents) {
    if (!resident.alive) continue;
    resident.activity = chooseActivity(resident, world.minuteOfDay);
    resident.districtId = targetDistrict(resident.activity, resident);
    const district = world.districts.find((item) => item.id === resident.districtId)!;
    const randomX = nextRandom(world.rngState);
    const randomY = nextRandom(randomX.state);
    world.rngState = randomY.state;
    resident.x += ((district.x + 40 + randomX.value * (district.width - 80)) - resident.x) * 0.09;
    resident.y += ((district.y + 50 + randomY.value * (district.height - 100)) - resident.y) * 0.09;
    updateNeeds(resident);
  }
  return world;
}

