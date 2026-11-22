# Audio clip fade in/out
Objective: let the owner set fade-in and fade-out on audio clips directly from the timeline, with the same timing heard in preview and rendered on export. Branch `feat/p0b-min-fork-identity`; no PR or merge. Test runner: Vitest, Node 22.

## Specs

- S1 User request (verbatim): "vorrei poter mettere fade in e fade out anche sulle clip audio".
- S2 Audio clips must expose fade-in and fade-out duration controls on the timeline.
- S3 Fade settings must persist in the editor document and remain backward-compatible with existing projects.
- S4 Export must apply `afade` to audio clips from the saved settings.
- S5 Preview must apply the same fade envelope while playing.
- S6 Behavior changes ship with Vitest tests through public interfaces; full verification and an ad-hoc rebuild must pass.

## Tasks

- [x] T1 (S1-S3) Extend editor audio state/schema with optional fade durations and add timeline UI. Route: inline.
- [x] T2 (S4, S5) Apply fades in export and preview. Route: inline.
- [x] T3 (S1-S6) Verify, commit and rebuild/relaunch the app. Route: inline. Pending final rebuild evidence.

## Log

- L1 (user, verbatim): "vorrei poter mettere fade in e fade out anche sulle clip audio".

- L2 (evidence): fades are stored as optional `fadeIn`/`fadeOut` on audio levels (0–30s), preserving legacy projects. The right-click clip menu exposes 0–10s sliders. Export applies `afade`; preview schedules the matching Web Audio gain envelope.
- L3 (evidence): `tests/audio-fades.test.ts`, `tests/composition-export.test.ts`, `tests/editor-audio-meter.test.ts` and `tests/timeline-volume-control.test.tsx` cover persistence, export RMS attenuation and preview scheduling. 522 Vitest tests passed.
