# Easy timeline zoom controls
Objective: make timeline zoom easy to discover and use with visible controls and keyboard shortcuts, preserving persisted zoom. Branch `feat/p0b-min-fork-identity`; no PR or merge. Test runner: Vitest, Node 22.

## Specs

- S1 User request (verbatim): "Devo poter fare zoom sulla timeline facilmente".
- S2 The toolbar already has zoom out/in/fit buttons and Ctrl/Cmd+wheel zoom. Keep them and add a visible zoom slider plus discoverable keyboard shortcuts without changing existing persisted zoom semantics.
- S3 Zoom stays clamped to the existing 1x-10x range. The active percentage must be readable and the control accessible.
- S4 Behavior changes ship with Vitest tests for zoom math and control rendering through public interfaces.

## Tasks

- [x] T1 (S1-S4) Add slider control with accessible label and percentage readout. Route: inline.
- [x] T2 (S1-S4) Add keyboard shortcuts for zoom in/out/fit. Route: inline.
- [x] T3 (S1-S4) Test zoom math and controls. Route: inline.
- [ ] T4 (S1-S4) Include zoom changes in final verification and rebuild. Route: inline; done.

## Log

- L1 (user, verbatim): "Devo poter fare zoom sulla timeline facilmente".
- L2 Existing implementation: `src/renderer/editor/useTimelineViewport.ts` clamps 1..10 with 1.5 step; `TimelineChrome.tsx` has +/- and fit buttons; Ctrl/Cmd+wheel anchored zoom already works.

- L3 Implementation: TimelineToolbar slider bound to `setTimelineZoom`, accessible label and percentage; Ctrl/Cmd + `+`, `-`, `0` shortcuts via `getTimelineZoomAfterShortcut`; existing 1..10 clamp and wheel zoom preserved.
