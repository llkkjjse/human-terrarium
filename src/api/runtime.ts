import { applyCommand, type CommandResult, type WorldCommand } from '../sim/commands';
import { createDialogueLine, type DialogueLine, type DialogueProvider } from '../sim/dialogue';
import { createSave, parseSave, type SaveEnvelope } from '../persistence/save';
import type {
  FrameGranularity,
  Resident,
  ResidentV2,
  WorldEvent,
  WorldEventType,
  WorldScenario,
  WorldState,
  WorldStateV2,
} from '../sim/types';
import { stepWorld } from '../sim/world';
import {
  FrameController,
  type AiFrameStatus,
  type FrameRunResult,
  type RuntimeDependencies,
} from './frame-controller';

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

export interface AiHumanTerrariumApi {
  getWorldSnapshot(): WorldStateV2;
  listResidents(filter?: { role?: ResidentV2['role']; districtId?: ResidentV2['districtId']; alive?: boolean }): ResidentV2[];
  getResident(id: string): ResidentV2 | null;
  getScenario(): WorldScenario;
  subscribe(type: WorldEventType | '*', handler: (event: WorldEvent) => void): () => void;
  subscribeState(handler: (world: WorldStateV2) => void): () => void;
  dispatch(command: WorldCommand): Promise<CommandResult>;
  runFrame(granularity: FrameGranularity, selectedResidentId?: string): Promise<FrameRunResult>;
  retryFrame(): Promise<FrameRunResult>;
  cancelAfterCurrentFrame(): void;
  abortCurrentFrame(): void;
  getAiFrameStatus(): AiFrameStatus;
  subscribeAiFrameStatus(handler: (status: AiFrameStatus) => void): () => void;
  replaceWorld(world: WorldStateV2): void;
  dispose(): void;
}

export function advanceLegacyWorld(
  input: WorldState,
  ticks = 1,
  onTick?: (event: WorldEvent) => void,
): WorldState {
  const world = structuredClone(input);
  const count = Math.max(0, Math.min(32, Math.floor(ticks)));
  for (let index = 0; index < count; index += 1) stepWorld(world);
  const summary: WorldEvent = {
    id: `tick-${world.tick}`,
    tick: world.tick,
    type: 'tick',
    title: 'Legacy simulation advance',
    detail: `${count} fixed ticks`,
    residentIds: [],
  };
  onTick?.(structuredClone(summary));
  return world;
}

function createLegacyRuntime(initialWorld: WorldState): HumanTerrariumApi & { replaceWorld(world: WorldState): void } {
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

function createAiRuntime(initialWorld: WorldStateV2, dependencies: RuntimeDependencies): AiHumanTerrariumApi {
  const controller = new FrameController(initialWorld, dependencies);
  const listeners = new Map<WorldEventType | '*', Set<(event: WorldEvent) => void>>();
  const stateListeners = new Set<(world: WorldStateV2) => void>();
  let knownEventIds = new Set(initialWorld.events.map((event) => event.id));

  function publish(event: WorldEvent): void {
    listeners.get(event.type)?.forEach((listener) => listener(structuredClone(event)));
    listeners.get('*')?.forEach((listener) => listener(structuredClone(event)));
  }

  controller.subscribeState((next) => {
    next.events.filter((event) => !knownEventIds.has(event.id)).forEach(publish);
    knownEventIds = new Set(next.events.map((event) => event.id));
    stateListeners.forEach((listener) => listener(structuredClone(next)));
  });

  return {
    getWorldSnapshot: () => controller.getWorldSnapshot(),
    listResidents: (filter = {}) => structuredClone(controller.getWorldSnapshot().residents.filter((resident) => (
      (filter.role === undefined || resident.role === filter.role)
      && (filter.districtId === undefined || resident.districtId === filter.districtId)
      && (filter.alive === undefined || resident.alive === filter.alive)
    ))),
    getResident: (id) => {
      const resident = controller.getWorldSnapshot().residents.find((candidate) => candidate.id === id);
      return resident ? structuredClone(resident) : null;
    },
    getScenario: () => structuredClone(controller.getWorldSnapshot().scenario),
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
      const next = controller.getWorldSnapshot();
      const result = applyCommand(next, command);
      if (result.ok) controller.replaceWorld(next);
      return result;
    },
    runFrame: (granularity, selectedResidentId) => controller.runFrame(granularity, selectedResidentId),
    retryFrame: () => controller.retryFrame(),
    cancelAfterCurrentFrame: () => controller.cancelAfterCurrentFrame(),
    abortCurrentFrame: () => controller.abortCurrentFrame(),
    getAiFrameStatus: () => controller.getStatus(),
    subscribeAiFrameStatus: (handler) => controller.subscribeStatus(handler),
    replaceWorld: (next) => controller.replaceWorld(next),
    dispose: () => {
      controller.dispose();
      listeners.clear();
      stateListeners.clear();
    },
  };
}

export function createRuntime(initialWorld: WorldStateV2, dependencies: RuntimeDependencies): AiHumanTerrariumApi;
export function createRuntime(initialWorld: WorldState): HumanTerrariumApi & { replaceWorld(world: WorldState): void };
export function createRuntime(
  initialWorld: WorldState | WorldStateV2,
  dependencies?: RuntimeDependencies,
): AiHumanTerrariumApi | (HumanTerrariumApi & { replaceWorld(world: WorldState): void }) {
  if (initialWorld.schemaVersion === 2) {
    if (!dependencies) throw new Error('AI runtime dependencies are required for a v2 world.');
    return createAiRuntime(initialWorld, dependencies);
  }
  return createLegacyRuntime(initialWorld);
}
