import { nextRandom } from './rng';
import type {
  AbilityScores,
  Asset,
  ResidentAppearance,
  ResidentFinances,
  ResidentSeed,
  ResidentV2,
  SocialClass,
  SocietyBlueprint,
  WorldScenario,
  WorldStateV2,
} from './types';
import { createWorld } from './world';

const abilityNames = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;

interface ClassInput {
  cash: number;
  income: number;
  debt: number;
  housingValue: number;
  vehicleValue: number;
  reputation: number;
}

function randomInt(state: { value: number }, min: number, max: number): number {
  const random = nextRandom(state.value);
  state.value = random.state;
  return min + Math.floor(random.value * (max - min + 1));
}

export function deriveSocialClass(input: ClassInput): SocialClass {
  const netWorth = input.cash + input.housingValue + input.vehicleValue - input.debt;
  const score = netWorth / 30_000 + input.income / 3_000 + input.reputation / 5;
  if (score < 12) return 'precarious';
  if (score < 28) return 'working';
  if (score < 60) return 'middle';
  if (score < 115) return 'affluent';
  return 'elite';
}

function abilities(state: { value: number }, seed?: ResidentSeed): AbilityScores {
  return Object.fromEntries(abilityNames.map((name) => [
    name,
    seed?.abilities?.[name] ?? randomInt(state, 1, 20),
  ])) as unknown as AbilityScores;
}

function scenarioFromBlueprint(blueprint: SocietyBlueprint): WorldScenario {
  return {
    schemaVersion: 1,
    id: blueprint.id,
    name: blueprint.name,
    description: blueprint.description,
    baseline: 'custom',
    parameters: structuredClone(blueprint.parameters),
    policies: structuredClone(blueprint.policies),
    opportunities: [],
  };
}

function buildAssets(
  residentId: string,
  index: number,
  finances: ResidentFinances,
  appearance: ResidentAppearance,
): Asset[] {
  const assets: Asset[] = [{
    id: `asset-${residentId}-cash`,
    ownerId: residentId,
    kind: 'cash',
    name: '现金与存款',
    value: finances.cash,
    visibleValue: 0,
  }];
  if (index % 4 !== 0) {
    const value = 120_000 + index * 28_000;
    assets.push({
      id: `asset-${residentId}-home`,
      ownerId: residentId,
      kind: 'home',
      name: index > 18 ? '宽敞住宅' : '社区住宅',
      value,
      visibleValue: Math.round(value * (1 - appearance.lowProfile / 140)),
      districtId: 'residential',
    });
  }
  if (index % 3 === 0) {
    const value = 22_000 + index * 6_000;
    assets.push({
      id: `asset-${residentId}-vehicle`,
      ownerId: residentId,
      kind: 'vehicle',
      name: index > 17 ? '高档汽车' : '代步车辆',
      value,
      visibleValue: Math.round(value * (1 - appearance.lowProfile / 120)),
    });
  }
  return assets;
}

export function createGeneratedWorld(input: {
  seed: number;
  blueprint: SocietyBlueprint;
  residents?: ResidentSeed[];
}): WorldStateV2 {
  const base = createWorld({ seed: input.seed, scenario: scenarioFromBlueprint(input.blueprint) });
  const state = { value: base.rngState };
  const allAssets: Asset[] = [];
  const residents: ResidentV2[] = base.residents.map((legacy, index) => {
    const seed = input.residents?.[index];
    const finances: ResidentFinances = {
      cash: seed?.finances?.cash ?? randomInt(state, 500, 180_000),
      income: seed?.finances?.income ?? randomInt(state, 1_800, 25_000),
      debt: seed?.finances?.debt ?? randomInt(state, 0, 120_000),
    };
    const appearance: ResidentAppearance = {
      clothingQuality: seed?.appearance?.clothingQuality ?? randomInt(state, 15, 95),
      conspicuousness: seed?.appearance?.conspicuousness ?? randomInt(state, 10, 90),
      lowProfile: seed?.appearance?.lowProfile ?? randomInt(state, 0, 85),
    };
    const residentId = legacy.id;
    const residentAssets = buildAssets(residentId, index, finances, appearance);
    allAssets.push(...residentAssets);
    const housingValue = residentAssets.find((asset) => asset.kind === 'home')?.value ?? 0;
    const vehicleValue = residentAssets.find((asset) => asset.kind === 'vehicle')?.value ?? 0;
    const reputation = randomInt(state, 20, 85);
    const realClass = deriveSocialClass({ ...finances, housingValue, vehicleValue, reputation });
    const visibleHousing = residentAssets.find((asset) => asset.kind === 'home')?.visibleValue ?? 0;
    const visibleVehicle = residentAssets.find((asset) => asset.kind === 'vehicle')?.visibleValue ?? 0;
    const perceivedClass = deriveSocialClass({
      cash: 0,
      income: Math.round(finances.income * appearance.conspicuousness / 100),
      debt: 0,
      housingValue: visibleHousing,
      vehicleValue: visibleVehicle,
      reputation,
    });
    return {
      ...legacy,
      name: seed?.name ?? legacy.name,
      age: seed?.age ?? legacy.age,
      role: seed?.role ?? legacy.role,
      abilities: abilities(state, seed),
      customTrait: '',
      finances,
      appearance,
      assetIds: residentAssets.map((asset) => asset.id),
      realClass,
      perceivedClass,
      reputation,
      playerGoal: '',
      personalGoal: '',
      currentPlan: [],
      knowledgeIds: [],
      legalStatus: 'clear',
      healthConditions: [],
    };
  });
  return {
    ...base,
    schemaVersion: 2,
    rngState: state.value,
    lastSavedAt: 0,
    blueprint: structuredClone(input.blueprint),
    districts: structuredClone(input.blueprint.districts),
    residents,
    assets: allAssets,
    knowledge: [],
    frameGranularity: '1h',
    queuedChanges: [],
    selectedResidentId: null,
  };
}
