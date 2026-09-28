import { z } from 'zod';
import type {
  AbilityScores,
  FrameGranularity,
  Needs,
  Personality,
  SocietyBlueprint,
  WorldStateV2,
} from '../sim/types';

const districtIdSchema = z.enum(['residential', 'commerce', 'commons', 'municipal']);
const actionCodeSchema = z.enum([
  'continue',
  'move',
  'work',
  'rest',
  'eat',
  'socialize',
  'seek_care',
  'select_target_for_fraud',
  'attempt_fraud',
  'attempt_robbery',
  'investigate',
  'attempt_arrest',
  'hide_evidence',
  'report_crime',
  'protest',
]);
const priorityBasisSchema = z.enum([
  'custom-trait',
  'player-goal',
  'emergency',
  'policy-law',
  'personal-goal',
  'routine',
]);

const residentActionSchema = z.object({
  residentId: z.string().min(1),
  action: actionCodeSchema,
  targetId: z.string().min(1).optional(),
  locationId: districtIdSchema.optional(),
  reason: z.string().min(1).max(500),
  planChange: z.string().max(300),
  priorityBasis: priorityBasisSchema,
  dialogue: z.array(z.string().max(300)).max(4),
});

const conversationSchema = z.object({
  id: z.string().min(1),
  participantIds: z.tuple([z.string().min(1), z.string().min(1)]).refine(
    ([left, right]) => left !== right,
    '对话参与者不能重复',
  ),
  locationId: districtIdSchema,
  lines: z.array(z.object({
    speakerId: z.string().min(1),
    text: z.string().min(1).max(500),
  })).min(2).max(12),
});

const candidateEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['illness-risk', 'accident-risk', 'job-risk', 'conflict-risk', 'crime-risk', 'protest-risk']),
  residentIds: z.array(z.string().min(1)).min(1).max(12),
  locationId: districtIdSchema.optional(),
  description: z.string().min(1).max(500),
});

const memoryUpdateSchema = z.object({
  id: z.string().min(1),
  residentId: z.string().min(1),
  text: z.string().min(1).max(500),
  importance: z.number().finite().min(0).max(100),
});

export const frameResponseSchema = z.object({
  residentActions: z.array(residentActionSchema).length(24).superRefine((actions, context) => {
    const ids = new Set<string>();
    actions.forEach((action, index) => {
      if (ids.has(action.residentId)) {
        context.addIssue({ code: 'custom', path: [index, 'residentId'], message: '居民动作重复' });
      }
      ids.add(action.residentId);
    });
  }),
  conversations: z.array(conversationSchema).superRefine((conversations, context) => {
    const ids = new Set<string>();
    conversations.forEach((conversation, index) => {
      if (ids.has(conversation.id)) {
        context.addIssue({ code: 'custom', path: [index, 'id'], message: '对话 ID 重复' });
      }
      ids.add(conversation.id);
    });
  }),
  candidateEvents: z.array(candidateEventSchema).max(24),
  memoryUpdates: z.array(memoryUpdateSchema).max(96),
});

export type ResidentAction = z.infer<typeof residentActionSchema>;
export type ConversationDraft = z.infer<typeof conversationSchema>;
export type CandidateEvent = z.infer<typeof candidateEventSchema>;
export type MemoryUpdate = z.infer<typeof memoryUpdateSchema>;
export type FrameResponse = z.infer<typeof frameResponseSchema>;

export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  estimatedCost: number;
}

export interface CompactResidentContext {
  id: string;
  name: string;
  role: string;
  districtId: string;
  abilities: AbilityScores;
  personality: Personality;
  customTrait: string;
  playerGoal: string;
  personalGoal: string;
  currentPlan: string[];
  finances: { cash: number; income: number; debt: number };
  realClass: string;
  perceivedClass: string;
  legalStatus: string;
  healthConditions: string[];
  recentMemories: Array<{ text: string; tone: string; tick: number }>;
  relevantKnowledge: Array<{ subjectId: string; claim: string; confidence: number; rumor: boolean }>;
}

export interface FrameRequest {
  protocolVersion: 1;
  worldId: string;
  frameStartTick: number;
  day: number;
  minuteOfDay: number;
  granularity: FrameGranularity;
  society: {
    name: string;
    description: string;
    social: SocietyBlueprint['social'];
    policies: Array<{ id: string; name: string; description: string; intensity: number }>;
  };
  residents: CompactResidentContext[];
  absoluteEvents: Array<{ id: string; originalText: string; payload: Record<string, unknown> }>;
  selectedResidentDetail?: {
    residentId: string;
    needs: Needs;
    reputation: number;
    relationships: Record<string, number>;
    visibleAssets: Array<{ id: string; kind: string; name: string; visibleValue: number }>;
  };
}

export function validateFrameResponse(input: unknown, world: WorldStateV2): FrameResponse {
  const response = frameResponseSchema.parse(input);
  const residentIds = new Set(world.residents.map((resident) => resident.id));
  const districtIds = new Set(world.districts.map((district) => district.id));
  const actionIds = new Set(response.residentActions.map((action) => action.residentId));
  if (actionIds.size !== residentIds.size || [...residentIds].some((id) => !actionIds.has(id))) {
    throw new Error('AI 居民动作引用不完整');
  }
  for (const action of response.residentActions) {
    if (!residentIds.has(action.residentId)) throw new Error('AI 动作引用了不存在的居民');
    if (action.targetId && !residentIds.has(action.targetId)) throw new Error('AI 动作引用了不存在的目标');
    if (action.locationId && !districtIds.has(action.locationId)) throw new Error('AI 动作引用了不存在的地点');
    const resident = world.residents.find((candidate) => candidate.id === action.residentId)!;
    if (resident.customTrait.trim() && action.priorityBasis !== 'custom-trait') {
      throw new Error(`${resident.name} 的动作没有遵守自定义特性优先级`);
    }
  }
  for (const conversation of response.conversations) {
    const participants = conversation.participantIds.map((id) => world.residents.find((resident) => resident.id === id));
    if (participants.some((resident) => !resident)) throw new Error('对话引用了不存在的居民');
    if (participants.some((resident) => resident!.districtId !== conversation.locationId)) {
      throw new Error('对话参与者不具备实际接触条件');
    }
    if (conversation.lines.some((line) => !conversation.participantIds.includes(line.speakerId))) {
      throw new Error('对话发言人引用无效');
    }
  }
  for (const event of response.candidateEvents) {
    if (event.residentIds.some((id) => !residentIds.has(id))) throw new Error('候选事件引用无效');
    if (event.locationId && !districtIds.has(event.locationId)) throw new Error('候选事件地点引用无效');
  }
  if (response.memoryUpdates.some((memory) => !residentIds.has(memory.residentId))) {
    throw new Error('记忆更新引用无效');
  }
  return response;
}
