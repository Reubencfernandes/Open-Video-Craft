# AI audio fade operations
Objective: let Claude/MCP add fade-in and fade-out to audio clips instead of replying that it cannot. Branch `feat/p0b-min-fork-identity`; no PR or merge. Test runner: Vitest, Node 22.

## Specs

- S1 User request (verbatim): "mi dice tramite AI che non può aggiungere un fade out sulla fine della clip audio! ma cazzo ti avevo detto di farlo!"
- S2 The validated `set_audio` operation must accept optional `fadeIn` and `fadeOut` seconds and preserve existing values when only gain/mute changes.
- S3 Claude, Gemini and MCP instructions must state that audio fades are applied with `set_audio` on the audio item and are supported.
- S4 Behavior changes ship with Vitest tests through public interfaces; full verification and an ad-hoc rebuild must pass.

## Tasks

- [x] T1 (S1, S2) Extend `set_audio` schema/types/operation with optional fade durations. Route: inline.
- [x] T2 (S1, S3) Update AI/MCP instructions. Route: inline.
- [x] T3 (S1-S4) Verify, commit and rebuild/relaunch the app. Route: inline. Final rebuild and live AI probe verified.

## Log

- L1 (user, verbatim): "mi dice tramite AI che non può aggiungere un fade out sulla fine della clip audio! ma cazzo ti avevo detto di farlo!"

- L2 (evidence): `set_audio` now accepts optional `fadeIn`/`fadeOut` (0–10 seconds), preserves unspecified values, and explicit prompts tell Claude/Gemini/MCP that fades are supported.

- L3 (evidence): final ad-hoc build relaunched the app as PID `3013`. A packaged-MCP Claude probe answered: "Sì, `set_audio` con `fadeOut: 2` è supportato (range 0–10 s)" and identified the audio item without applying edits.
- L4 (evidence): 527 Vitest tests passed, typecheck, build, MCP smoke and `git diff --check`.
