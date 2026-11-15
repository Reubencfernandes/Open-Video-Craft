# ADR-0003: Editor domain v3 as the single mutation path, delivered in reversible slices

- **Status:** Proposed. Individual slices are conditional on their own tests; P3.9 on a latency measurement.
- **Date:** 2026-11-15
- **Deciders:** Project owner
- **Plan reference:** [0000](0000-architecture-roadmap.md) ADR-5, phase P3 (slices P3.0–P3.11)

## Context

`src/shared/editor-domain` is the strongest asset (31 operations, all-or-nothing apply, revision CAS persistence). But only MCP and the Gemini agent use `applyEditorOperations`; the UI mutates React state and saves snapshots. Undo covers only timeline segments. The document is flat (clips with `track` and `lane` integers, global zoom and speed ranges, project-wide layout scalars) and migration supports only v1→v2.

## Decision

Evolve to schema v3 with `MediaSource`, `Track`, `Clip`, `Transition`, typed `Effect`s with versioned parameters, keyframes, overlays and templates, subtitle cues, and per-track and master audio processing. Every mutation is a `Transaction` with actor, base revision and operations. History is document-level (candidate: Immer patches). A migration registry chains v1→v2→v3 as pure, fixture-tested functions; readers reject a newer major version and preserve unknown fields in `extensions`.

The migration of the UI is **not** a single step. It is twelve slices (P3.0–P3.11), each behind its own flag, each with a differential test that replays recorded interaction traces through the legacy handler and through `dispatch(ops)`, and each independently reversible. Persistence keeps the existing single full-snapshot CAS save until P3.10.

## Conditions

- P3.1 measures document size before Immer is adopted; otherwise hand-written inverse operations.
- P3.9 makes the main-process `DocumentService` authoritative (renderer becomes an optimistic replica) only if commit latency p95 ≤ 50 ms and gesture frame rate is unchanged; otherwise the renderer keeps authority.
- P3.10 flips the default writer to v3 only after an internal soak; the v2 backup file is kept.

## Consequences

- AI and UI finally share the same operations; undo covers every change.
- Cost: a long migration of ~22k renderer lines, mitigated by slicing and the dual-run rule.
