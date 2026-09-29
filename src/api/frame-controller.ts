import type { AiClient } from '../ai/client';
import {
  frameResponseSchema,
  validateFrameResponse,
  type AiUsage,
  type FrameRequest,
  type FrameResponse,
} from '../ai/contracts';
import { buildFrameRequest } from '../ai/context';
import type { AiRunRecord, SaveDatabase } from '../persistence/database';
import { prepareFrame, resolveFrame } from '../sim/resolver';
import type { FrameGranularity, WorldStateV2 } from '../sim/types';

export interface RuntimeDependencies {
  aiClient: AiClient;
  frameStore: Pick<SaveDatabase, 'commitFrame'>;
}

export type AiFramePhase = 'idle' | 'preparing' | 'thinking' | 'repairing' | 'resolving' | 'saving' | 'error' | 'cancelled';

export interface AiFrameStatus {
  phase: AiFramePhase;
  frameStartTick?: number;
  granularity?: FrameGranularity;
  error?: string;
  usage?: AiUsage;
  cancelAfterCurrent: boolean;
}

export type FrameRunResult =
  | { ok: true; world: WorldStateV2; usage: AiUsage }
  | { ok: false; error: string; cancelled?: boolean };

function combinedUsage(first: AiUsage, second?: AiUsage): AiUsage {
  if (!second) return structuredClone(first);
  return {
    model: second.model || first.model,
    inputTokens: first.inputTokens + second.inputTokens,
    outputTokens: first.outputTokens + second.outputTokens,
    durationMs: first.durationMs + second.durationMs,
    estimatedCost: first.estimatedCost + second.estimatedCost,
  };
}

function traitViolationIds(response: FrameResponse, world: WorldStateV2): string[] {
  return response.residentActions
    .filter((action) => {
      const resident = world.residents.find((item) => item.id === action.residentId);
      return Boolean(resident?.customTrait.trim()) && action.priorityBasis !== 'custom-trait';
    })
    .map((action) => action.residentId);
}

function validateExceptTrait(response: unknown, world: WorldStateV2): FrameResponse {
  const parsed = frameResponseSchema.parse(response);
  const withoutTraits = structuredClone(world);
  for (const resident of withoutTraits.residents) resident.customTrait = '';
  return validateFrameResponse(parsed, withoutTraits);
}

function repairRequest(request: FrameRequest, residentId: string): FrameRequest {
  const repaired = structuredClone(request);
  const resident = repaired.residents.find((item) => item.id === residentId);
  if (resident) {
    repaired.selectedResidentDetail = {
      residentId,
      needs: {
        hunger: 0,
        energy: 0,
        health: 0,
        hygiene: 0,
        social: 0,
        leisure: 0,
        safety: 0,
        purpose: 0,
      },
      reputation: 0,
      relationships: {},
      visibleAssets: [],
    };
  }
  return repaired;
}

export class FrameController {
  private world: WorldStateV2;
  private status: AiFrameStatus = { phase: 'idle', cancelAfterCurrent: false };
  private inFlight: Promise<FrameRunResult> | null = null;
  private aborted = false;
  private lastRun: { granularity: FrameGranularity; selectedResidentId?: string } | null = null;
  private readonly stateListeners = new Set<(world: WorldStateV2) => void>();
  private readonly statusListeners = new Set<(status: AiFrameStatus) => void>();
  private readonly onPageHide = (): void => this.abortCurrentFrame();

  constructor(initialWorld: WorldStateV2, private readonly dependencies: RuntimeDependencies) {
    this.world = structuredClone(initialWorld);
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.onPageHide);
  }

  getWorldSnapshot(): WorldStateV2 {
    return structuredClone(this.world);
  }

  replaceWorld(next: WorldStateV2): void {
    if (this.inFlight) throw new Error('Cannot replace the world while an AI frame is running.');
    this.world = structuredClone(next);
    this.publishState();
  }

  getStatus(): AiFrameStatus {
    return structuredClone(this.status);
  }

  subscribeState(listener: (world: WorldStateV2) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  subscribeStatus(listener: (status: AiFrameStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(next: AiFrameStatus): void {
    this.status = structuredClone(next);
    for (const listener of this.statusListeners) listener(this.getStatus());
  }

  private publishState(): void {
    const snapshot = this.getWorldSnapshot();
    for (const listener of this.stateListeners) listener(structuredClone(snapshot));
  }

  runFrame(granularity: FrameGranularity, selectedResidentId?: string): Promise<FrameRunResult> {
    if (this.inFlight) return this.inFlight;
    this.lastRun = { granularity, selectedResidentId };
    this.aborted = false;
    const operation = this.executeFrame(granularity, selectedResidentId);
    const tracked = operation.finally(() => {
      if (this.inFlight === tracked) this.inFlight = null;
    });
    this.inFlight = tracked;
    return tracked;
  }

  retryFrame(): Promise<FrameRunResult> {
    if (this.inFlight) return this.inFlight;
    if (!this.lastRun) return Promise.resolve({ ok: false, error: 'No frame is available to retry.' });
    return this.runFrame(this.lastRun.granularity, this.lastRun.selectedResidentId);
  }

  cancelAfterCurrentFrame(): void {
    this.setStatus({ ...this.status, cancelAfterCurrent: true });
  }

  abortCurrentFrame(): void {
    if (!this.inFlight) return;
    this.aborted = true;
  }

  dispose(): void {
    this.abortCurrentFrame();
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.onPageHide);
    this.stateListeners.clear();
    this.statusListeners.clear();
  }

  private async requestAndValidate(
    preparedWorld: WorldStateV2,
    request: FrameRequest,
  ): Promise<{ response: FrameResponse; usage: AiUsage }> {
    const first = await this.dependencies.aiClient.runFrame(request);
    const response = validateExceptTrait(first.data, preparedWorld);
    const violations = traitViolationIds(response, preparedWorld);
    if (!violations.length) {
      return { response: validateFrameResponse(response, preparedWorld), usage: first.usage };
    }
    this.setStatus({
      phase: 'repairing',
      frameStartTick: request.frameStartTick,
      granularity: request.granularity,
      usage: first.usage,
      cancelAfterCurrent: this.status.cancelAfterCurrent,
    });
    const repaired = await this.dependencies.aiClient.runFrame(repairRequest(request, violations[0]));
    const repairResponse = validateExceptTrait(repaired.data, preparedWorld);
    const merged = structuredClone(response);
    for (const residentId of violations) {
      const replacement = repairResponse.residentActions.find((action) => action.residentId === residentId);
      if (!replacement) throw new Error(`Trait repair omitted resident ${residentId}.`);
      const index = merged.residentActions.findIndex((action) => action.residentId === residentId);
      merged.residentActions[index] = replacement;
    }
    return {
      response: validateFrameResponse(merged, preparedWorld),
      usage: combinedUsage(first.usage, repaired.usage),
    };
  }

  private cancelledResult(frameStartTick: number, granularity: FrameGranularity): FrameRunResult {
    this.setStatus({
      phase: 'cancelled',
      frameStartTick,
      granularity,
      cancelAfterCurrent: this.status.cancelAfterCurrent,
    });
    return { ok: false, error: 'Frame cancelled before commit.', cancelled: true };
  }

  private async executeFrame(
    granularity: FrameGranularity,
    selectedResidentId?: string,
  ): Promise<FrameRunResult> {
    const snapshot = structuredClone(this.world);
    const frameStartTick = snapshot.tick;
    try {
      this.setStatus({ phase: 'preparing', frameStartTick, granularity, cancelAfterCurrent: false });
      const prepared = prepareFrame(snapshot, snapshot.queuedChanges);
      const request = buildFrameRequest(prepared.world, granularity, selectedResidentId ?? prepared.world.selectedResidentId);
      request.absoluteEvents = prepared.absoluteEvents.map((event) => ({
        id: event.id,
        originalText: event.originalText,
        payload: structuredClone(
          prepared.changes.find((change) => change.id === event.id)?.payload ?? {},
        ),
      }));
      this.setStatus({ phase: 'thinking', frameStartTick, granularity, cancelAfterCurrent: false });
      const ai = await this.requestAndValidate(prepared.world, request);
      if (this.aborted) return this.cancelledResult(frameStartTick, granularity);

      this.setStatus({
        phase: 'resolving',
        frameStartTick,
        granularity,
        usage: ai.usage,
        cancelAfterCurrent: this.status.cancelAfterCurrent,
      });
      const resolution = resolveFrame({ prepared, response: ai.response, granularity });
      if (this.aborted) return this.cancelledResult(frameStartTick, granularity);

      this.setStatus({
        phase: 'saving',
        frameStartTick,
        granularity,
        usage: ai.usage,
        cancelAfterCurrent: this.status.cancelAfterCurrent,
      });
      const run: AiRunRecord = {
        id: `ai-run-${snapshot.blueprint.id}-${frameStartTick}-${Date.now()}`,
        worldId: snapshot.blueprint.id,
        frameStartTick,
        status: 'success',
        durationMs: ai.usage.durationMs,
        inputTokens: ai.usage.inputTokens,
        outputTokens: ai.usage.outputTokens,
        estimatedCost: ai.usage.estimatedCost,
      };
      if (this.aborted) return this.cancelledResult(frameStartTick, granularity);
      await this.dependencies.frameStore.commitFrame(resolution.world, resolution.history, run);
      if (this.aborted) return this.cancelledResult(frameStartTick, granularity);

      this.world = structuredClone(resolution.world);
      this.publishState();
      this.setStatus({
        phase: 'idle',
        frameStartTick,
        granularity,
        usage: ai.usage,
        cancelAfterCurrent: this.status.cancelAfterCurrent,
      });
      return { ok: true, world: this.getWorldSnapshot(), usage: structuredClone(ai.usage) };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI frame failed.';
      this.setStatus({
        phase: 'error',
        frameStartTick,
        granularity,
        error: message,
        cancelAfterCurrent: this.status.cancelAfterCurrent,
      });
      return { ok: false, error: message };
    }
  }
}
