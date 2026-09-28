import { applyCommand, type CommandResult, type WorldCommand } from '../sim/commands';
import { createDialogueLine, type DialogueLine, type DialogueProvider } from '../sim/dialogue';
import { createSave, parseSave, type SaveEnvelope } from '../persistence/save';
import type { Resident, WorldEvent, WorldEventType, WorldScenario, WorldState } from '../sim/types';
import { stepWorld } from '../sim/world';

export interface HumanTerrariumApi {
  getWorldSnapshot(): WorldState;
  listResidents(filter?: { role?: Resident['role']; districtId?: Resident['districtId']; alive?: boolean }): Resident[];
  getResident(id: string): Resident | null;
  getScenario(): WorldScenario;
  subscribe(type: WorldEventType | '*', handler: (event: WorldEvent) => void): () => void;
  subscribeState(handler: (world: WorldState) => void): () => void;
  dispatch(command: WorldCommand): Promise<CommandResult>;
  registerDialogueProvider(provider: DialogueProvider): () => void;
  createDialogue(speakerId: string, listenerId: string): Promise<DialogueLine>;
  advance(ticks?: number): WorldState;
  exportSave(): Promise<SaveEnvelope>;
  importSave(data: string | SaveEnvelope): Promise<CommandResult>;
}

export function createRuntime(initialWorld: WorldState): HumanTerrariumApi & { replaceWorld(world: WorldState): void } {
  let world = initialWorld;
  let dialogueProvider: DialogueProvider | undefined;
  const listeners = new Map<WorldEventType | '*', Set<(event: WorldEvent) => void>>();
  const stateListeners = new Set<(world: WorldState) => void>();
  function publish(event: WorldEvent): void {
    listeners.get(event.type)?.forEach((listener) => listener(structuredClone(event)));
    listeners.get('*')?.forEach((listener) => listener(structuredClone(event)));
  }
  function publishNewEvents(knownEventIds: Set<string>): void {
    world.events.filter((event) => !knownEventIds.has(event.id)).forEach(publish);
  }
  function notifyState(): void {
    stateListeners.forEach((listener) => listener(structuredClone(world)));
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
    subscribeState: (handler) => {
      stateListeners.add(handler);
      return () => stateListeners.delete(handler);
    },
    dispatch: async (command) => {
      const knownEventIds = new Set(world.events.map((event) => event.id));
      const result = applyCommand(world, command);
      publishNewEvents(knownEventIds);
      notifyState();
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
    advance: (ticks = 1) => {
      const count = Math.max(0, Math.min(32, Math.floor(ticks)));
      for (let index = 0; index < count; index += 1) {
        const knownEventIds = new Set(world.events.map((event) => event.id));
        stepWorld(world);
        publishNewEvents(knownEventIds);
      }
      publish({ id: `tick-${world.tick}`, tick: world.tick, type: 'tick', title: '模拟推进', detail: `${count} 个时间片`, residentIds: [] });
      notifyState();
      return structuredClone(world);
    },
    exportSave: async () => createSave(world),
    importSave: async (data) => {
      try {
        world = parseSave(data);
        notifyState();
        return { ok: true };
      } catch (error) {
        return { ok: false, code: 'INVALID_COMMAND', message: error instanceof Error ? error.message : '存档无效' };
      }
    },
    replaceWorld: (next) => {
      world = next;
      notifyState();
    },
  };
}
