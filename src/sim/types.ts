export type DistrictId = 'residential' | 'commerce' | 'commons' | 'municipal';

export type Role =
  | 'supply'
  | 'commerce'
  | 'care'
  | 'maintenance'
  | 'safety'
  | 'culture';

export type Activity =
  | 'idle'
  | 'sleep'
  | 'eat'
  | 'work'
  | 'socialize'
  | 'relax'
  | 'seek-care'
  | 'commute';

export interface EraParameters {
  economy: {
    prosperity: number;
    prices: number;
    wages: number;
    housingPressure: number;
    unemployment: number;
    inequality: number;
  };
  institutions: {
    taxBurden: number;
    welfare: number;
    healthcare: number;
    education: number;
    laborProtection: number;
    publicSafety: number;
  };
  technology: {
    automation: number;
    information: number;
    medicine: number;
    transport: number;
    productivity: number;
  };
  culture: {
    familyOrientation: number;
    workEthic: number;
    consumption: number;
    openness: number;
    socialTrust: number;
  };
  environment: {
    supply: number;
    pollution: number;
    climatePressure: number;
    disasterRisk: number;
    epidemicRisk: number;
  };
}

export interface Policy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  intensity: number;
  modifiers: Array<{ path: string; delta: number }>;
}

export interface Opportunity {
  id: string;
  name: string;
  target: DistrictId | Role | 'everyone';
  remainingTicks: number;
  prosperityBoost: number;
  causalId: string;
}

export interface WorldScenario {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  baseline: 'cn-modern' | 'custom';
  parameters: EraParameters;
  policies: Policy[];
  opportunities: Opportunity[];
}

export interface Personality {
  extraversion: number;
  diligence: number;
  agreeableness: number;
  curiosity: number;
  resilience: number;
}

export interface Needs {
  hunger: number;
  energy: number;
  health: number;
  hygiene: number;
  social: number;
  leisure: number;
  safety: number;
  purpose: number;
}

export interface Memory {
  id: string;
  text: string;
  tone: 'positive' | 'neutral' | 'negative';
  tick: number;
  causalId?: string;
}

export interface Resident {
  id: string;
  name: string;
  age: number;
  role: Role;
  districtId: DistrictId;
  homeDistrictId: 'residential';
  x: number;
  y: number;
  income: number;
  savings: number;
  employed: boolean;
  alive: boolean;
  color: string;
  activity: Activity;
  personality: Personality;
  traits: string[];
  needs: Needs;
  relationships: Record<string, number>;
  memories: Memory[];
}

export interface District {
  id: DistrictId;
  name: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
}

export interface CommunityMetrics {
  vitality: number;
  health: number;
  trust: number;
  mobility: number;
  equality: number;
  safety: number;
}

export type WorldEventType =
  | 'tick'
  | 'activity'
  | 'dialogue'
  | 'relationship'
  | 'economy'
  | 'policy'
  | 'opportunity'
  | 'health'
  | 'migration'
  | 'death'
  | 'system';

export interface WorldEvent {
  id: string;
  tick: number;
  type: WorldEventType;
  title: string;
  detail: string;
  residentIds: string[];
  causalId?: string;
}

export interface WorldState {
  schemaVersion: 1;
  seed: number;
  rngState: number;
  tick: number;
  day: number;
  minuteOfDay: number;
  timeScale: 0 | 1 | 2 | 4;
  scenario: WorldScenario;
  districts: District[];
  residents: Resident[];
  metrics: CommunityMetrics;
  events: WorldEvent[];
  nextEventSequence: number;
  lastSavedAt: number;
}

export type FrameGranularity = '1h' | '12h' | '1d';

export interface AbilityScores {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export type SocialClass = 'precarious' | 'working' | 'middle' | 'affluent' | 'elite';
export type AssetKind = 'cash' | 'home' | 'vehicle' | 'item';

export interface Asset {
  id: string;
  ownerId: string;
  kind: AssetKind;
  name: string;
  value: number;
  visibleValue: number;
  districtId?: DistrictId;
}

export interface KnowledgeRecord {
  id: string;
  residentId: string;
  subjectId: string;
  topic: 'wealth' | 'routine' | 'relationship' | 'event' | 'reputation';
  claim: string;
  source: 'observation' | 'conversation' | 'work' | 'public' | 'investigation';
  confidence: number;
  lastUpdatedTick: number;
  rumor: boolean;
}

export interface SocietyBlueprint {
  schemaVersion: 2;
  id: string;
  name: string;
  description: string;
  sourceText: string;
  parameters: EraParameters;
  policies: Policy[];
  districts: District[];
  social: {
    inequality: number;
    mobility: number;
    trust: number;
    corruption: number;
    crimePressure: number;
    gossip: number;
  };
}

export interface ResidentFinances {
  cash: number;
  income: number;
  debt: number;
}

export interface ResidentAppearance {
  clothingQuality: number;
  conspicuousness: number;
  lowProfile: number;
}

export interface ResidentSeed {
  name?: string;
  age?: number;
  role?: Role;
  abilities?: Partial<AbilityScores>;
  finances?: Partial<ResidentFinances>;
  appearance?: Partial<ResidentAppearance>;
}

export interface ResidentV2 extends Resident {
  abilities: AbilityScores;
  customTrait: string;
  finances: ResidentFinances;
  appearance: ResidentAppearance;
  assetIds: string[];
  realClass: SocialClass;
  perceivedClass: SocialClass;
  reputation: number;
  playerGoal: string;
  personalGoal: string;
  currentPlan: string[];
  knowledgeIds: string[];
  legalStatus: 'clear' | 'suspect' | 'wanted' | 'detained' | 'convicted';
  healthConditions: string[];
}

export type QueuedWorldChange =
  | { id: string; type: 'absolute-event'; originalText: string; payload: Record<string, unknown> }
  | { id: string; type: 'policy'; originalText: string; payload: Record<string, unknown> }
  | { id: string; type: 'resident-edit'; residentId: string; payload: Record<string, unknown> };

export interface WorldStateV2 extends Omit<WorldState, 'schemaVersion' | 'residents'> {
  schemaVersion: 2;
  blueprint: SocietyBlueprint;
  residents: ResidentV2[];
  assets: Asset[];
  knowledge: KnowledgeRecord[];
  frameGranularity: FrameGranularity;
  queuedChanges: QueuedWorldChange[];
  selectedResidentId: string | null;
}
