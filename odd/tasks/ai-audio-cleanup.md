# AI audio cleanup — Claude Max
Objective: let the in-app Claude Max assistant remove wind and other unwanted noise from speech without sacrificing voice clarity, using local deterministic FFmpeg filters and a persistent editor operation. Branch `feat/p0b-min-fork-identity`; no PR or merge. Test runner: Vitest, Node 22.

## Specs

- S1 User request (verbatim): "Aggiungi una funzione che con l'ai (sempre quella collegata come Claude Plan) possa togliere rumori, come il rumore del vento, senza perdere la qualità e chiarezza della voce parlata".
- S2 Claude Max is an authenticated text/coding CLI subscription, not an audio-generation model. It may choose and apply a cleanup operation; the actual signal processing must run locally with FFmpeg. No Anthropic API key, Gemini key or audio upload may be required.
- S3 Cleanup must be conservative: preserve speech bandwidth, avoid aggressive equalisation, apply denoise only to sources explicitly selected by the user or by Claude, and record the settings in the project so the operation is undoable.
- S4 The cleanup must be available to Claude through the existing `apply_edit_plan` MCP operation schema with an `audio` action category, and exposed in the Audio panel for direct use.
- S5 FFmpeg export must apply the stored cleanup per audio item, including audio embedded in video clips. The filter chain must be testable as a pure function.
- S6 Tests must cover: default and preset filter construction, strength bounds, state validation, apply/remove operation, and FFmpeg graph inclusion. Behavior changes ship with Vitest tests through public interfaces.

## Tasks

- [x] T1 (S1-S6) Map audio state and export pipeline. Route: inline.
- [x] T2 (S1-S6) Add typed cleanup state, schema and editor operations with RED tests. Route: inline; tests green.
- [x] T3 (S1-S6) Add FFmpeg filter builder and pass cleanup settings into export. Route: inline; real FFmpeg export test green.
- [x] T4 (S1-S6) Expose cleanup in MCP/Claude instructions and Audio panel. Route: inline.
- [ ] T5 (S1-S6) Run full verification, commit and rebuild the local app. Route: inline; done.

## Log

- L1 (user, verbatim): "Aggiungi una funzione che con l'ai (sempre quella collegata come Claude Plan) possa togliere rumori, come il rumore del vento, senza perdere la qualità e chiarezza della voce parlata".
- L2 Available FFmpeg filters confirmed locally: `afftdn`, `anlmdn`, `arnndn`, `highpass`, `loudnorm`, `speechnorm`. `arnndn` needs an external model, so the implementation uses bundled FFmpeg filters only.
- L3 Current state has only `audioLevels` (volume/mute); export builds one filter per input in `src/main/ffmpeg.ts`, and `src/main/composition-export.ts` derives audio segments from the saved editor document.

- L4 Implementation: `audio-cleanup.ts` with wind/room/steady presets; `audioCleanup` persisted in editor state; `set_audio_cleanup` operation accepted by MCP; Audio panel toggle/preset/strength; FFmpeg inserts cleanup before gain and fades. Full export test with wind filter passed.
