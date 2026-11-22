# Timeline clip volume control
Objective: let the owner change the volume of a clip directly on the timeline, for both video clips and audio/music clips. Branch `feat/p0b-min-fork-identity`; no PR or merge. Test runner: Vitest, Node 22.

## Specs

- S1 User request (verbatim): "devo poter cambiare il volume di una clip audio o video direttamente dalla timeline".
- S2 Every video and audio timeline clip must expose an inline volume control that edits the existing per-item `audioLevels` state.
- S3 The control must not start clip move/trim drags and must work for AI-generated music on audio lanes.
- S4 Visual volume state must match the effective level already used by playback and export.
- S5 Behavior changes ship with Vitest tests through the public component interface; full verification and an ad-hoc rebuild must pass.

## Tasks

- [ ] T1 (S1-S4) Add an inline volume slider to timeline clips and wire it to `onSetAudioLevel`. Route: inline.
- [ ] T2 (S1-S5) Verify, commit and rebuild/relaunch the app. Route: inline.

## Log

- L1 (user, verbatim): "devo poter cambiare il volume di una clip audio o video direttamente dalla timeline".
