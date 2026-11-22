# Voice input for the AI chat
Objective: let the owner dictate messages into the AI assistant chat using the microphone, transcribed locally with the existing Whisper path. Branch `feat/p0b-min-fork-identity`; no PR or merge. Test runner: Vitest, Node 22.

## Specs

- S1 User request (verbatim): "nella chat AI dammi la possibilità di scrivere tramite voce del microfono".
- S2 The AI composer must expose a microphone control to start/stop dictation.
- S3 Dictated audio must be transcribed locally through the existing `stt:transcribe` IPC and inserted into the composer text.
- S4 No cloud API key, audio upload or new dependency may be required.
- S5 Behavior changes ship with Vitest tests through public interfaces; full verification and an ad-hoc rebuild must pass.

## Tasks

- [x] T1 (S1-S4) Add a voice recorder/transcriber hook around the existing local STT bridge. Route: inline.
- [x] T2 (S1, S2) Add microphone UI to the AI composer with recording/error states. Route: inline.
- [x] T3 (S1-S5) Verify, commit and rebuild/relaunch the app. Route: inline. Final rebuild and relaunch verified.

## Log

- L1 (user, verbatim): "nella chat AI dammi la possibilità di scrivere tramite voce del microfono".

- L2 (evidence): the composer now records microphone audio, resamples it to 16 kHz mono and transcribes it with the existing local Whisper worker; text is appended to the draft. 531 Vitest tests passed.

- L3 (evidence): final app rebuilt and relaunched as PID `30279`, frontmost with window `Open Video Craft`.
