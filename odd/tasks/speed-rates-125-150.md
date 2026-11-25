# Speed rates 1.25x and 1.5x
Objective: allow timeline speed effects at 1.25x and 1.5x in editor UI, persisted state, MCP operations and FFmpeg export. Branch `feat/p0b-min-fork-identity`; no PR or merge. Test runner: Vitest, Node 22.

## Specs

- S1 User request (verbatim): "Devo poter aumentare la velocità delle tracce anche a 1,25x e 1,5x".
- S2 `SpeedRate` currently permits only integers 1 through 5; the new fractional rates must be first-class values in the shared domain and runtime guards.
- S3 All speed consumers must stay consistent: editor UI, persisted projects, MCP `set_speed`, `get_analysis`/inspect capabilities and FFmpeg export. Existing rates must keep working.
- S4 Behavior changes ship with Vitest tests covering schema acceptance, reducer application and export-rate math.

## Tasks

- [x] T1 (S1-S4) Add 1.25 and 1.5 to shared speed types, guards and operation schema. Route: inline.
- [x] T2 (S1-S4) Update speed UI controls and labels. Route: inline.
- [x] T3 (S1-S4) Add focused RED/GREEN tests for new rates. Route: inline.
- [ ] T4 (S1-S4) Run full checks, commit and rebuild local app. Route: inline; done.

## Log

- L1 (user, verbatim): "Devo poter aumentare la velocità delle tracce anche a 1,25x e 1,5x".

- L2 Implementation: `SpeedRate` includes 1.25 and 1.5; runtime guards, zod schema, reducer, UI registry and FFmpeg export types accept them. Validation and export type regression fixed; focused tests green.
