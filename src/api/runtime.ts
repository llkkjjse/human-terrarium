import { applyCommand, type CommandResult, type WorldCommand } from '../sim/commands';
import { createDialogueLine, type DialogueLine, type DialogueProvider } from '../sim/dialogue';
import type { Resident, WorldEvent, WorldEventType, WorldScenario, WorldState } from '../sim/types';

export interface HumanTerrariumApi {
  getWorldSnapshot(): WorldState;
  listResidents(filter?: { role?: Resident['role']; districtId?: Resident['districtId']; alive?: boolean }): Resident[];
  getResident(id: string): Resident | null;
  getScenario(): WorldScenario;
  subscribe(type: WorldEventType | '*', handler: (event: WorldEvent) => void): () => void;
  dispatch(command: WorldCommand): Promise<CommandResult>;
  registerDialogueProvider(provider: DialogueProvider): () => void;
  createDialogue(speakerId: string, listenerId: string): Promise<DialogueLine>;
}

export function createRuntime(initialWorld: WorldState): HumanTerrariumApi & { replaceWorld(world: WorldState): void } {
  let world = initialWorld;
  let dialogueProvider: DialogueProvider | undefined;
  const listeners = new Map<WorldEventType | '*', Set<(event: WorldEvent) => void>>();
  function publish(event: WorldEvent): void {
    listeners.get(event.type)?.forEach((listener) => listener(structuredClone(event)));
    listeners.get('*')?.forEach((listener) => listener(structuredClone(event)));
  }
  return {
    getWorldSnapshot: () => structuredClone(world),
    listResidents: (filter = {}) => structuredClone(world.residents.filter((resident) => (
      (filter.role === undefined || resident.role === filter.role)
      && (filter.districtId === undefined || resident.districtId === filter.districtId)
      && (filter.alive === undefined || resident.alive === filter.alive)
    ))),
    getResident: (id) => {
      const resident = world.residents.find((candidate) => candidate.id === id);
      return resident ? structuredClone(resident) : null;
    },
    getScenario: () => structuredClone(world.scenario),
    subscribe: (type, handler) => {
      const bucket = listeners.get(type) ?? new Set();
      bucket.add(handler);
      listeners.set(type, bucket);
      return () => bucket.delete(handler);
    },
    dispatch: async (command) => {
      const eventCount = world.events.length;
      const result = applyCommand(world, command);
      world.events.slice(eventCount).forEach(publish);
      return result;
    },
    registerDialogueProvider: (provider) => {
      dialogueProvider = provider;
      return () => { if (dialogueProvider === provider) dialogueProvider = undefined; };
    },
    createDialogue: async (speakerId, listenerId) => {
      const speaker = world.residents.find((resident) => resident.id === speakerId);
      const listener = world.residents.find((resident) => resident.id === listenerId);
      if (!speaker || !listener) throw new Error('Resident not found');
      return createDialogueLine(world, speaker, listener, dialogueProvider);
    },
    replaceWorld: (next) => { world = next; },
  };
}

