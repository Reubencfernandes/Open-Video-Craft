# In-project audio/video recording without stopping preview
Objective: let the owner record audio and video clips directly into the current project while preview playback continues. Branch `feat/p0b-min-fork-identity`; no PR or merge. Test runner: Vitest, Node 22.

## Specs

- S1 User request (verbatim): "Dammi la possibilità di registrare clip sia audio che video direttamente dal progetto e senza fermare il play della preview".
- S2 The editor must expose audio-only and video+audio recording controls.
- S3 Recording must not pause or stop the preview playhead.
- S4 Completed recordings must be imported into the current project as playable clips.
- S5 Behavior changes ship with Vitest tests through public interfaces; full verification and an ad-hoc rebuild must pass.

## Tasks

- [x] T1 (S1-S3) Map existing recorder IPC and identify the minimal non-blocking recording path. Route: inline.
- [x] T2 (S1, S4) Add editor controls and import finished recordings. Route: inline.
- [x] T3 (S1-S5) Verify, commit and rebuild/relaunch the app. Route: inline. Final rebuild and relaunch verified.

## Log

- L1 (user, verbatim): "Dammi la possibilità di registrare clip sia audio che video direttamente dal progetto e senza fermare il play della preview".

- L2 (evidence): Media panel now exposes microphone and camera+mic recording. Finished WebM clips are written into the project import folder through `editor:import-recorded-clip` and inserted at the current playhead without pausing playback.

- L3 (evidence): final ad-hoc build relaunched as PID `19577`, frontmost with window `Open Video Craft`.
