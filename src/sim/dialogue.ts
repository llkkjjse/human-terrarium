import { z } from 'zod';
import type { Resident, WorldState } from './types';

export interface DialogueRequest {
  speaker: Pick<Resident, 'id' | 'name' | 'role' | 'traits' | 'personality' | 'activity'>;
  listener: Pick<Resident, 'id' | 'name' | 'role' | 'traits' | 'personality' | 'activity'>;
  day: number;
  districtName: string;
  recentContext: string[];
}

export interface DialogueLine {
  text: string;
  tone: 'warm' | 'neutral' | 'tense';
  source: 'template' | 'ai';
}

export type DialogueProvider = (request: DialogueRequest) => Promise<{ text: string; tone?: 'warm' | 'neutral' | 'tense' }>;

const responseSchema = z.object({ text: z.string().min(1).max(80), tone: z.enum(['warm', 'neutral', 'tense']).default('neutral') });
const templates = ['今天这边挺热闹的。', '忙完这一阵，要不要去公园走走？', '最近的日子有点不一样，你也感觉到了吗？', '路上慢点，晚上见。'];

export function templateDialogue(world: WorldState, speaker: Resident, listener: Resident): DialogueLine {
  const relationship = speaker.relationships[listener.id] ?? 40;
  const index = (world.tick + speaker.id.charCodeAt(speaker.id.length - 1)) % templates.length;
  return { text: templates[index], tone: relationship >= 60 ? 'warm' : 'neutral', source: 'template' };
}

export async function createDialogueLine(
  world: WorldState,
  speaker: Resident,
  listener: Resident,
  provider?: DialogueProvider,
): Promise<DialogueLine> {
  if (!provider) return templateDialogue(world, speaker, listener);
  const district = world.districts.find((item) => item.id === speaker.districtId)!;
  const request: DialogueRequest = {
    speaker: { id: speaker.id, name: speaker.name, role: speaker.role, traits: speaker.traits, personality: speaker.personality, activity: speaker.activity },
    listener: { id: listener.id, name: listener.name, role: listener.role, traits: listener.traits, personality: listener.personality, activity: listener.activity },
    day: world.day,
    districtName: district.name,
    recentContext: speaker.memories.slice(-3).map((memory) => memory.text),
  };
  try {
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500));
    const response = responseSchema.parse(await Promise.race([provider(request), timeout]));
    return { ...response, source: 'ai' };
  } catch {
    return templateDialogue(world, speaker, listener);
  }
}

