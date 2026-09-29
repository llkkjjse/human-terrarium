# SDD ledger — plan: docs/superpowers/plans/2026-09-29-ai-social-terrarium.md
Baseline: npm test → 21 files, 35 tests passed.
Pre-flight: Task 1 → Task 2 — WorldStateV2 and worldStateV2Schema feed migration/storage; interfaces align.
Pre-flight: Task 1 → Task 3 — domain IDs and resident fields feed AI schemas/context; interfaces align.
Pre-flight: Tasks 1 and 3 → Task 4 — gateway consumes shared AI contracts; interfaces align.
Pre-flight: Tasks 1 and 3 → Task 5 — resolver consumes WorldStateV2 and validated FrameResponse; interfaces align.
Pre-flight: Tasks 2, 3 and 5 → Task 6 — persistence, AI client and staged resolver meet in the runtime; interfaces align.
Pre-flight: Tasks 3 and 6 → Task 7 — setup/policy/frame UI consumes AiClient and runtime status; interfaces align.
Pre-flight: Tasks 2 and 6 → Task 8 — resident lens consumes paged history and intervention commands; interfaces align.
Pre-flight: Tasks 1–8 → Task 9 — E2E fixtures exercise the complete public UI/gateway boundary; interfaces align.
Pre-flight Ruling: Task 2 boot versus Task 7 setup — represent a healthy empty database as BootState.world = null so first boot reaches AI society setup; corrupt existing saves still surface an error without overwrite — cost if wrong: boot API and its tests need one compatibility adapter.
Pre-flight Ruling: absolute-event parsing endpoint — use POST /api/event/parse because the spec requires an independent on-demand parse call but does not name its route — cost if wrong: one gateway/client route rename.
Task 2: Ruling: staged boot API — keep legacy resolveBootState until Task 7 switches main.tsx, while resolveV2BootState is the authoritative no-offline-progress path — cost if wrong: temporary dual boot APIs can confuse a caller before Task 7.
Task 4: Ruling: cross-platform build/dev orchestration — add scripts/build.mjs and invoke local JavaScript entrypoints because Windows cannot reliably spawn package .cmd shims without a shell; this also enforces client tsc, server tsc, then Vite — cost if wrong: one extra script and start command to replace.
Task 1: complete (commits e233b2c..2f454dd, tests: npm test -- tests/sim/generation-v2.test.ts tests/sim/schema-v2.test.ts tests/sim/world.test.ts tests/sim/scenarios.test.ts →    Duration  1.47s (transform 213ms, setup 784ms, collect 609ms, tests 85ms, environment 2.76s, prepare 610ms))
Task 2: complete (commits 2f454dd..bff0fe4, tests: npm test -- tests/persistence/migration-v2.test.ts tests/persistence/history-v2.test.ts tests/persistence/database.test.ts tests/persistence/save.test.ts tests/review/bootRecovery.test.ts →    Duration  1.80s (transform 323ms, setup 1.13s, collect 1.15s, tests 331ms, environment 4.03s, prepare 771ms))
Task 3: complete (commits bff0fe4..1638d03, tests: npm test -- tests/ai/contracts.test.ts tests/ai/context.test.ts tests/sim/schema-v2.test.ts →    Duration  1.48s (transform 192ms, setup 594ms, collect 476ms, tests 76ms, environment 1.93s, prepare 390ms))
Task 4: complete (commits 1638d03..67218f5, tests: npm test -- tests/server/gateway.test.ts tests/server/deepseek.test.ts →    Duration  1.33s (transform 127ms, setup 341ms, collect 199ms, tests 94ms, environment 1.14s, prepare 320ms))
Task 5: complete (commits 67218f5..6d4668f, tests: npm test -- tests/sim/resolver-priority.test.ts tests/sim/resolver-life.test.ts tests/sim/resolver-crime.test.ts tests/sim/resolver-determinism.test.ts tests/sim/world.test.ts →    Duration  1.77s (transform 307ms, setup 1.19s, collect 1.24s, tests 68ms, environment 4.00s, prepare 902ms))
