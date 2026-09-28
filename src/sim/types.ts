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
  lastSavedAt: number;
}
