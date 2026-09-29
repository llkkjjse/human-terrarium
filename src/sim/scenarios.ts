import { z } from 'zod';
import type { EraParameters, WorldScenario } from './types';

const bounded = z.number().min(0).max(100);
const axis = <T extends z.ZodRawShape>(shape: T) => z.object(shape);

export const scenarioSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  description: z.string().max(240),
  baseline: z.enum(['cn-modern', 'custom']),
  parameters: z.object({
    economy: axis({ prosperity: bounded, prices: bounded, wages: bounded, housingPressure: bounded, unemployment: bounded, inequality: bounded }),
    institutions: axis({ taxBurden: bounded, welfare: bounded, healthcare: bounded, education: bounded, laborProtection: bounded, publicSafety: bounded }),
    technology: axis({ automation: bounded, information: bounded, medicine: bounded, transport: bounded, productivity: bounded }),
    culture: axis({ familyOrientation: bounded, workEthic: bounded, consumption: bounded, openness: bounded, socialTrust: bounded }),
    environment: axis({ supply: bounded, pollution: bounded, climatePressure: bounded, disasterRisk: bounded, epidemicRisk: bounded }),
  }),
  policies: z.array(z.object({
    id: z.string(), name: z.string(), description: z.string(), enabled: z.boolean(), intensity: bounded,
    modifiers: z.array(z.object({ path: z.string(), delta: z.number().min(-100).max(100) })),
  })),
  opportunities: z.array(z.object({
    id: z.string(),
    name: z.string(),
    target: z.enum([
      'residential',
      'commerce',
      'commons',
      'municipal',
      'supply',
      'care',
      'maintenance',
      'safety',
      'culture',
      'everyone',
    ]),
    remainingTicks: z.number().int().nonnegative(),
    prosperityBoost: z.number(), causalId: z.string(),
  })),
});

const base: EraParameters = {
  economy: { prosperity: 62, prices: 50, wages: 57, housingPressure: 64, unemployment: 28, inequality: 46 },
  institutions: { taxBurden: 48, welfare: 58, healthcare: 67, education: 70, laborProtection: 58, publicSafety: 76 },
  technology: { automation: 48, information: 78, medicine: 68, transport: 72, productivity: 64 },
  culture: { familyOrientation: 61, workEthic: 72, consumption: 58, openness: 62, socialTrust: 57 },
  environment: { supply: 76, pollution: 42, climatePressure: 38, disasterRisk: 20, epidemicRisk: 18 },
};

function make(id: string, name: string, description: string, patch: Partial<EraParameters>): WorldScenario {
  const parameters = structuredClone(base);
  for (const [group, values] of Object.entries(patch)) {
    Object.assign(parameters[group as keyof EraParameters], values);
  }
  return { schemaVersion: 1, id, name, description, baseline: 'cn-modern', parameters, policies: [], opportunities: [] };
}

const presets: WorldScenario[] = [
  make('stable-modern', '平稳当代社区', '就业与公共服务相对稳定的当代城市社区。', {}),
  make('economic-downturn', '经济下行期', '需求收缩、失业增加，居民承受更强生活压力。', {
    economy: { ...base.economy, prosperity: 32, unemployment: 65, wages: 39, housingPressure: 76 },
    culture: { ...base.culture, socialTrust: 43 },
  }),
  make('industrial-upgrade', '产业升级期', '新产业带来培训与流动机会，同时淘汰部分旧岗位。', {
    economy: { ...base.economy, prosperity: 72, unemployment: 36, wages: 68 },
    technology: { ...base.technology, automation: 72, productivity: 78 },
  }),
  make('automated-future', '高自动化架空城', '自动化承担大部分生产，社会重新定义工作与价值。', {
    economy: { ...base.economy, prosperity: 84, wages: 74, unemployment: 52 },
    institutions: { ...base.institutions, welfare: 82, healthcare: 86 },
    technology: { ...base.technology, automation: 94, information: 92, medicine: 88, transport: 90, productivity: 96 },
    culture: { ...base.culture, workEthic: 45, openness: 82 },
  }),
];

export function listPresets(): WorldScenario[] {
  return structuredClone(presets);
}

export function getPreset(id: string): WorldScenario {
  const preset = presets.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown scenario preset: ${id}`);
  return structuredClone(preset);
}

