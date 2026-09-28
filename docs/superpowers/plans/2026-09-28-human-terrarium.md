# Human Terrarium Implementation Plan

> Implement the approved human-terrarium design using inline TDD.

**Goal:** Deliver a browser-playable Chinese human terrarium with autonomous residents and era-level controls.

**Architecture:** Pure deterministic TypeScript simulation, Phaser renderer, React control shell, and a versioned browser SDK.

**Tech Stack:** TypeScript, React, Phaser 3, Zod, Dexie, Vitest, Playwright.

## Tasks

1. Deterministic world model, presets, residents, behavior and causal events.
2. Commands, policies, opportunities, dialogue and browser SDK.
3. Save/import/export and bounded offline simulation.
4. Phaser map renderer and React era-director interface.
5. Integration, accessibility, build and browser verification.

