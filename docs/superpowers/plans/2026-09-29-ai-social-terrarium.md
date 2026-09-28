# AI Social Terrarium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing browser terrarium into a local DeepSeek-driven simulation of 24 persistent residents whose plans, conversations, resources, knowledge and causal life events can be observed and influenced.

**Architecture:** Keep React/Phaser as the presentation layer and move authoritative frame resolution into focused TypeScript simulation modules. A loopback Node gateway owns the DeepSeek key and returns schema-validated intentions; the runtime applies those intentions transactionally and Dexie stores current state plus append-only histories.

**Tech Stack:** React 19, Phaser 3, TypeScript 5.9, Zod 4, Dexie 4, Vitest, Testing Library, Playwright, Node HTTP, DeepSeek Chat Completions API

**Spec:** `docs/superpowers/specs/2026-09-29-ai-social-terrarium-design.md`

## Global Constraints

- A confirmed world contains exactly 24 residents.
- Naturally generated D&D-style abilities are integers from 1 through 20; player-edited values may exceed 20 but must remain finite.
- Priority is invariant/schema → absolute event → custom trait → player goal → emergency need → policy/law → personal long-term goal → routine.
- Normal simulation uses exactly one batch DeepSeek request per 1-hour, 12-hour or 1-day frame.
- DeepSeek proposes intentions and dialogue only; the local resolver alone settles assets, injury, death, evidence, arrest and punishment.
- A failed or invalid AI frame never advances world time and never commits a partial frame.
- Raw life logs and conversations persist until explicit player deletion; AI context remains bounded.
- The API key exists only in the loopback Node gateway environment and is never persisted or sent to the browser.
- Existing React, Phaser, TypeScript, Zod, Dexie, Vitest and Playwright foundations remain in place.

## Review Focus

- Oversized or malicious natural-language fields must be rejected without hanging the gateway; Task 4 adds body-size and field-length tests.
- Concurrent double-clicks on “advance” must not run or commit two frames; Task 6 adds a single-flight runtime test.
- A tab closing during an in-flight frame must leave the last committed world loadable; Task 6 adds an abort-before-commit test.
- A v1 save containing corrupt cross-references must fall back to backup rather than produce a partly migrated v2 world; Task 2 adds this migration test.
- A valid AI response with all 24 actions but duplicated conversation IDs must be rejected atomically; Task 3 adds uniqueness validation.

---

### Task 1: Version 2 domain model and deterministic society generation

**Files:**
- Modify: `src/sim/types.ts`
- Create: `src/sim/schema.ts`
- Create: `src/sim/generation.ts`
- Modify: `src/sim/world.ts`
- Test: `tests/sim/generation-v2.test.ts`
- Test: `tests/sim/schema-v2.test.ts`

**Interfaces:**
- Consumes: existing `EraParameters`, district geometry and seeded `nextRandom(state)`.
- Produces: `WorldStateV2`, `ResidentV2`, `SocietyBlueprint`, `AbilityScores`, `Asset`, `KnowledgeRecord`, `FrameGranularity`; `worldStateV2Schema`; `createGeneratedWorld(input: { seed: number; blueprint: SocietyBlueprint; residents?: ResidentSeed[] }): WorldStateV2`; `deriveSocialClass(resident, assets): SocialClass`.

- [ ] **Step 1: Write the failing v2 generation and schema tests**

Assert `createGeneratedWorld` creates exactly 24 unique residents, blank `customTrait`, six integer abilities in `[1, 20]`, valid ownership references, role coverage, separate real/perceived class, and deterministic output for the same seed. Assert `worldStateV2Schema` accepts a finite edited ability of 27 but rejects `Infinity`, missing owners and duplicate IDs.

- [ ] **Step 2: Run the new tests and verify RED**

Run: `npm test -- tests/sim/generation-v2.test.ts tests/sim/schema-v2.test.ts`

Expected: FAIL because v2 types, schema and generator do not exist.

- [ ] **Step 3: Implement the v2 domain, schema and generator**

Keep each file focused: declarations in `types.ts`, Zod/reference validation in `schema.ts`, seeded creation and class derivation in `generation.ts`; adapt `world.ts` exports without yet removing the legacy stepper.

- [ ] **Step 4: Run the task tests and existing simulation tests**

Run: `npm test -- tests/sim/generation-v2.test.ts tests/sim/schema-v2.test.ts tests/sim/world.test.ts tests/sim/scenarios.test.ts`

Expected: PASS with all named files green.

- [ ] **Step 5: Commit**

Run `git add src/sim/types.ts src/sim/schema.ts src/sim/generation.ts src/sim/world.ts tests/sim/generation-v2.test.ts tests/sim/schema-v2.test.ts`, then run `git commit -m "feat: add v2 social world model"`.

### Task 2: Append-only persistence and v1-to-v2 migration

**Files:**
- Modify: `src/persistence/database.ts`
- Modify: `src/persistence/save.ts`
- Create: `src/persistence/migrate.ts`
- Modify: `src/persistence/boot.ts`
- Test: `tests/persistence/migration-v2.test.ts`
- Test: `tests/persistence/history-v2.test.ts`
- Modify: `tests/persistence/database.test.ts`

**Interfaces:**
- Consumes: `WorldStateV2` and `worldStateV2Schema` from Task 1; legacy v1 envelopes.
- Produces: `migrateSaveToV2(input: unknown): SaveEnvelopeV2`; `HistoryBatch`; `SaveDatabase.commitFrame(world, history, aiRun)`; paged `listLifeLogs`, `listConversations`, `listEvents`; storage statistics and explicit history deletion.

- [ ] **Step 1: Write failing migration and history tests**

Assert v1 migration is idempotent, retains all legacy residents/events, fills new fields, does not duplicate assets, and rejects corrupt references so `load()` uses the last good backup. Assert one `commitFrame` atomically writes world, life logs, conversations, events, knowledge, memories and AI run; pagination preserves older rows and no automatic cleanup occurs.

- [ ] **Step 2: Run the persistence tests and verify RED**

Run: `npm test -- tests/persistence/migration-v2.test.ts tests/persistence/history-v2.test.ts tests/persistence/database.test.ts`

Expected: FAIL because v2 migration and history tables are absent.

- [ ] **Step 3: Add Dexie v2 stores, migration and transactional history APIs**

Define stores `worlds`, `residents`, `lifeLogs`, `conversations`, `events`, `knowledge`, `memories`, `aiRuns` while retaining v1 `saves` for migration and backup recovery. Replace automatic offline stepping with restoration of the last committed frame because AI frames cannot be fabricated offline.

- [ ] **Step 4: Run persistence and boot tests**

Run: `npm test -- tests/persistence/migration-v2.test.ts tests/persistence/history-v2.test.ts tests/persistence/database.test.ts tests/persistence/save.test.ts tests/review/bootRecovery.test.ts`

Expected: PASS and migration remains repeatable.

- [ ] **Step 5: Commit**

Run `git add src/persistence tests/persistence tests/review/bootRecovery.test.ts`, then run `git commit -m "feat: persist permanent resident histories"`.

### Task 3: AI contracts, bounded context and response validation

**Files:**
- Create: `src/ai/contracts.ts`
- Create: `src/ai/context.ts`
- Create: `src/ai/client.ts`
- Test: `tests/ai/contracts.test.ts`
- Test: `tests/ai/context.test.ts`

**Interfaces:**
- Consumes: Task 1 domain types.
- Produces: `FrameRequest`, `FrameResponse`, `ResidentAction`, `ConversationDraft`, `CandidateEvent`, `MemoryUpdate`, `AiUsage`; `frameResponseSchema`; `buildFrameRequest(world, granularity, selectedResidentId): FrameRequest`; `AiClient` with `generateWorld`, `compilePolicy`, `parseAbsoluteEvent`, `runFrame`.

- [ ] **Step 1: Write failing protocol and context tests**

Assert the schema requires one unique action or `continue` for every one of the 24 residents, rejects nonexistent references, direct settled outcomes, duplicate conversation IDs and impossible contact. Assert context includes raw custom traits and selected-resident detail while bounding memories and excluding render coordinates/full history.

- [ ] **Step 2: Run the AI unit tests and verify RED**

Run: `npm test -- tests/ai/contracts.test.ts tests/ai/context.test.ts`

Expected: FAIL because AI contracts and context builder do not exist.

- [ ] **Step 3: Implement contracts, semantic validation, context selection and browser client**

Use discriminated action codes, stable field order and Zod structural validation followed by world-aware reference/priority validation. The browser client targets only same-origin `/api/*` endpoints and exposes no key option.

- [ ] **Step 4: Run AI and determinism tests**

Run: `npm test -- tests/ai/contracts.test.ts tests/ai/context.test.ts tests/sim/schema-v2.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run `git add src/ai tests/ai`, then run `git commit -m "feat: define validated AI frame protocol"`.

### Task 4: Loopback DeepSeek gateway and local startup

**Files:**
- Create: `server/index.ts`
- Create: `server/deepseek.ts`
- Create: `server/prompts.ts`
- Create: `server/http.ts`
- Create: `scripts/dev.mjs`
- Create: `.env.example`
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `tsconfig.server.json`
- Test: `tests/server/gateway.test.ts`
- Test: `tests/server/deepseek.test.ts`

**Interfaces:**
- Consumes: Task 3 request/response schemas.
- Produces: `createGateway(dependencies): http.Server`; `DeepSeekService` methods for `/api/world/generate`, `/api/policy/compile`, `/api/event/parse`, `/api/frame/run`; `npm run dev` starts Vite and a gateway bound to `127.0.0.1`.

- [ ] **Step 1: Write failing gateway tests with a mocked upstream fetch**

Assert endpoint routing, `deepseek-flash` default, strict JSON request, timeout, token/latency capture, one malformed-JSON repair attempt, no retry for balance/network errors, 413 for oversized bodies, rejection of oversized text fields, loopback binding, redacted errors and absence of the API key in responses/log records.

- [ ] **Step 2: Run server tests and verify RED**

Run: `npm test -- tests/server/gateway.test.ts tests/server/deepseek.test.ts`

Expected: FAIL because the gateway is absent.

- [ ] **Step 3: Implement the Node gateway and startup scripts**

Use Node HTTP and built-in `fetch`; add only `tsx` as a development dependency. Load `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` and `DEEPSEEK_BASE_URL` from `.env.local`, bind to `127.0.0.1`, and make `scripts/dev.mjs` terminate both child processes when either exits.

- [ ] **Step 4: Run gateway tests and both TypeScript builds**

Run in order:

```text
npm test -- tests/server/gateway.test.ts tests/server/deepseek.test.ts
npm run build
```

Expected: PASS; client and server type checks exit 0.

- [ ] **Step 5: Commit**

Run in order:

```text
git add server scripts .env.example .gitignore package.json package-lock.json tsconfig.server.json vite.config.ts tests/server
git commit -m "feat: add local DeepSeek gateway"
```

### Task 5: Transactional frame resolver and causal systems

**Files:**
- Create: `src/sim/resolver/index.ts`
- Create: `src/sim/resolver/priority.ts`
- Create: `src/sim/resolver/routine.ts`
- Create: `src/sim/resolver/economy.ts`
- Create: `src/sim/resolver/health.ts`
- Create: `src/sim/resolver/crime.ts`
- Create: `src/sim/resolver/knowledge.ts`
- Create: `src/sim/resolver/history.ts`
- Test: `tests/sim/resolver-priority.test.ts`
- Test: `tests/sim/resolver-life.test.ts`
- Test: `tests/sim/resolver-crime.test.ts`
- Test: `tests/sim/resolver-determinism.test.ts`

**Interfaces:**
- Consumes: Task 1 `WorldStateV2`; Task 3 validated `FrameResponse`.
- Produces: `prepareFrame(world: WorldStateV2, changes: QueuedWorldChange[]): PreparedFrame` which applies absolute events and committed policy/goal edits before AI context construction; `resolveFrame(input: { prepared: PreparedFrame; response: FrameResponse; granularity: FrameGranularity }): FrameResolution` where resolution contains next world, append-only history batch and global-event projection.

- [ ] **Step 1: Write failing resolver tests**

Assert absolute mutation beats custom trait, custom trait beats player goal, ordinary life proceeds without dialogue, asset transfers conserve ownership/value, perceived wealth—not hidden truth—selects targets, crime creates evidence before investigation/arrest, illness can progress, sheriff knowledge is limited, and serious events share causal IDs.

- [ ] **Step 2: Run resolver tests and verify RED**

Run: `npm test -- tests/sim/resolver-priority.test.ts tests/sim/resolver-life.test.ts tests/sim/resolver-crime.test.ts tests/sim/resolver-determinism.test.ts`

Expected: FAIL because the resolver modules do not exist.

- [ ] **Step 3: Implement pure staged resolution**

Apply absolute mutations and committed control changes in `prepareFrame`, then resolve movement/routine, economy, health, crime/law, knowledge/gossip and history in fixed order using the world RNG only. Return cloned prepared/next states and batches; never mutate the caller on failure. Project only high-value events to the global timeline.

- [ ] **Step 4: Run resolver and legacy simulation tests**

Run: `npm test -- tests/sim/resolver-priority.test.ts tests/sim/resolver-life.test.ts tests/sim/resolver-crime.test.ts tests/sim/resolver-determinism.test.ts tests/sim/world.test.ts`

Expected: PASS, including identical outputs for identical world/response/seed.

- [ ] **Step 5: Commit**

Run `git add src/sim/resolver tests/sim/resolver-*.test.ts`, then run `git commit -m "feat: resolve causal resident life frames"`.

### Task 6: Async runtime orchestration and intervention commands

**Files:**
- Modify: `src/api/runtime.ts`
- Modify: `src/sim/commands.ts`
- Create: `src/api/frame-controller.ts`
- Test: `tests/api/frame-controller.test.ts`
- Modify: `tests/api/runtime.test.ts`
- Modify: `tests/api/advance.test.ts`

**Interfaces:**
- Consumes: Task 2 `commitFrame`, Task 3 `AiClient`/context, Task 5 `prepareFrame`/`resolveFrame`.
- Produces: `RuntimeDependencies { aiClient: AiClient; frameStore: Pick<SaveDatabase, 'commitFrame'> }`; `createRuntime(initialWorld, dependencies)`; `runFrame(granularity, selectedResidentId?): Promise<FrameRunResult>`; `retryFrame()`; `cancelAfterCurrentFrame()`; commands `set-personal-goal`, `set-custom-trait`, `edit-resident`, `queue-absolute-event`, `implement-policy`; observable `AiFrameStatus`.

- [ ] **Step 1: Write failing runtime orchestration tests**

Assert one frame prepares queued absolute/policy changes before building AI context, makes one normal AI call, validates then resolves then commits, and only then publishes state. Assert timeout/invalid refs/repair failure leaves time and persistence unchanged; double invocation returns the same in-flight promise; abort/pagehide before commit leaves the previous snapshot loadable; trait violations request one resident repair and otherwise reject the frame.

- [ ] **Step 2: Run runtime tests and verify RED**

Run: `npm test -- tests/api/frame-controller.test.ts tests/api/runtime.test.ts tests/api/advance.test.ts`

Expected: FAIL because async AI frame control and intervention commands are absent.

- [ ] **Step 3: Implement the single-flight frame controller and commands**

Replace UI-facing fixed-tick advancement with async `runFrame`; preserve a clearly named legacy step helper only for migration compatibility tests. Queue drafts without timeline events; add timeline entries only when policy/goal/trait/absolute-event commands are formally committed according to the spec.

- [ ] **Step 4: Run API, persistence and resolver tests**

Run: `npm test -- tests/api tests/persistence tests/sim/resolver-*.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run `git add src/api src/sim/commands.ts tests/api`, then run `git commit -m "feat: orchestrate transactional AI frames"`.

### Task 7: Society creation and natural-language policy console

**Files:**
- Create: `src/ui/WorldSetup.tsx`
- Create: `src/ui/PolicyEditor.tsx`
- Create: `src/ui/FrameControls.tsx`
- Modify: `src/ui/App.tsx`
- Modify: `src/main.tsx`
- Modify: `src/styles.css`
- Test: `tests/ui/WorldSetup.test.tsx`
- Test: `tests/ui/PolicyEditor.test.tsx`
- Test: `tests/ui/FrameControls.test.tsx`

**Interfaces:**
- Consumes: Task 3 `AiClient`; Task 6 runtime and AI status.
- Produces: new-world setup/preview/confirm flow; policy draft/compile/implement flow; 1h/12h/1d, step/continuous/fast/pause controls with visible timing/token/cost/error state.

- [ ] **Step 1: Write failing setup, policy and time-control tests**

Assert setup sends natural language plus structured axes, previews exactly 24 editable residents and confirms only valid worlds. Assert typing/sliding creates no timeline item, “正式实施政策” creates one, frame controls call the selected granularity, failed AI pauses with retry, and pause waits for the current request.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `npm test -- tests/ui/WorldSetup.test.tsx tests/ui/PolicyEditor.test.tsx tests/ui/FrameControls.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement setup, policy and frame controls**

Keep server errors actionable and retain drafts after failure. First boot with no v2 world opens setup instead of silently creating an offline simulated world; an existing valid save opens directly.

- [ ] **Step 4: Run UI and boot tests**

Run: `npm test -- tests/ui tests/review/bootRecovery.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run `git add src/ui src/main.tsx src/styles.css tests/ui`, then run `git commit -m "feat: add AI society and policy controls"`.

### Task 8: Resident lens, permanent history and prominent forced events

**Files:**
- Create: `src/ui/ResidentLens.tsx`
- Create: `src/ui/ResidentEditor.tsx`
- Create: `src/ui/HistoryList.tsx`
- Create: `src/ui/Timeline.tsx`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/GameCanvas.tsx`
- Modify: `src/game/mapModel.ts`
- Modify: `src/styles.css`
- Test: `tests/ui/ResidentLens.test.tsx`
- Test: `tests/ui/Timeline.test.tsx`
- Test: `tests/game/mapModel.test.ts`

**Interfaces:**
- Consumes: Task 2 paged history; Task 6 intervention commands; existing Phaser map update API.
- Produces: selected-resident tabs for profile/assets, abilities/personality/trait, goals/plans, routine/health/spending, relations/knowledge, life history, complete dialogue, crime/legal, editing and forced events; filtered global `Timeline`.

- [ ] **Step 1: Write failing resident-lens and timeline tests**

Assert custom trait starts blank, is saved verbatim, accepts abilities above 20, and is displayed separately from generated personality. Assert paged lifetime logs and full dialogue remain accessible, global timeline hides routine/control edits, and a “玩家强制事件” always remains visible with original text, direct changes and causal descendants.

- [ ] **Step 2: Run resident UI and map tests and verify RED**

Run: `npm test -- tests/ui/ResidentLens.test.tsx tests/ui/Timeline.test.tsx tests/game/mapModel.test.ts`

Expected: FAIL because the resident lens and timeline projection UI do not exist.

- [ ] **Step 3: Implement the resident lens, editor, virtualized history and timeline**

Use paged rendering rather than loading all history into the DOM. Enrich map display with home/vehicle/status cues derived from visible wealth and low-profile settings, never hidden true wealth.

- [ ] **Step 4: Run UI, map and accessibility-facing tests**

Run: `npm test -- tests/ui tests/game/mapModel.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run `git add src/ui src/game/mapModel.ts src/styles.css tests/ui tests/game/mapModel.test.ts`, then run `git commit -m "feat: add detailed resident observation lens"`.

### Task 9: End-to-end integration, documentation and release verification

**Files:**
- Modify: `tests/e2e/terrarium.spec.ts`
- Create: `tests/e2e/ai-failure.spec.ts`
- Create: `tests/fixtures/mock-ai.ts`
- Modify: `playwright.config.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: Tasks 1–8 public UI and local gateway contracts.
- Produces: deterministic mocked-AI browser acceptance coverage and complete local DeepSeek setup/run documentation.

- [ ] **Step 1: Write failing end-to-end acceptance tests**

Cover new-world generation, policy implementation, conflicting trait/goal precedence, forced event display, several frames of personal history/dialogue, reload persistence, AI timeout pause/retry and absence of slider noise in the timeline.

- [ ] **Step 2: Run the new E2E tests and verify RED**

Run: `npm run test:e2e -- tests/e2e/terrarium.spec.ts tests/e2e/ai-failure.spec.ts`

Expected: FAIL until the mock gateway fixture and final UI wiring are complete.

- [ ] **Step 3: Add the deterministic mock gateway, final wiring and README instructions**

Document `npm install`, copying `.env.example` to `.env.local`, obtaining a DeepSeek key, `npm run dev`, the three frame granularities, costs, privacy boundary, storage/export behavior and troubleshooting. Do not claim offline AI operation.

- [ ] **Step 4: Run full verification**

Run in order:

```text
npm test
npm run build
npm run test:e2e
```

Expected: all Vitest tests pass, both TypeScript/build stages exit 0, and all Playwright tests pass.

- [ ] **Step 5: Commit**

Run `git add tests/e2e tests/fixtures playwright.config.ts README.md`, then run `git commit -m "test: verify AI social terrarium end to end"`.
