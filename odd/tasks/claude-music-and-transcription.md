# Claude-subscription music and transcription
Objective: let the owner use the Claude Max subscription for music and AI transcription without requiring a Gemini API key. Music uses Claude to choose style/structure and a local synthesis engine to render audio; transcription uses the existing local Whisper analysis orchestrated through the Open Video Craft MCP tools. Branch `feat/p0b-min-fork-identity`; no PR or merge. Test runner: Vitest, Node 22.

## Specs

- S1 User request (verbatim): "Anche per la musica e trascrizioni con AI devo poter usare il mio abbonamento di Claude come abbiamo fatto per le altre funzionalità".
- S2 Owner decision (verbatim): "Claude + synth locale". No Gemini/Lyria API key may be required for the default music path.
- S3 Music requests through the assistant must let Claude choose the musical style/structure and render an audible local audio file that the editor can import and place on the timeline.
- S4 AI transcription must stay local through Whisper and be reachable from Claude via MCP analysis tools; it must not require a cloud API key or upload audio.
- S5 Existing Gemini/Lyria behavior must keep working when a key is configured; the default Claude path must not depend on it.
- S6 Behavior changes ship with Vitest tests through public interfaces; full verification and an ad-hoc rebuild must pass before the app is relaunched.

## Tasks

- [x] T1 (S1-S5) Map the current music generation, subtitle transcription, MCP and assistant prompt paths. Route: inline.
- [x] T2 (S2, S3, S5) Implement a local music synthesizer and expose it through the editor/MCP path used by Claude. Route: inline.
- [x] T3 (S1, S4) Make Claude-driven transcription explicitly use the existing local Whisper/MCP path. Route: inline.
- [x] T4 (S1-S6) Verify, commit in reviewable slices and rebuild/relaunch the app. Route: inline. Final rebuild and relaunch verified.

## Log

- L1 (user, verbatim): "Anche per la musica e trascrizioni con AI devo poter usare il mio abbonamento di Claude come abbiamo fatto per le altre funzionalità".
- L2 (owner choice, verbatim): "Claude + synth locale".
- L3 (decision): Claude cannot emit audio as a model; it will orchestrate a local deterministic synth. Audio remains local and no credential is read or transmitted.

- L4 (evidence): transcription already defaults to `whisper-local`; Claude now receives explicit instructions to call `start_analysis`, read `query_analysis_transcript` and apply `replace_subtitles` without any cloud key.
- L5 (evidence): `renderLocalMusic` produces a deterministic 44.1 kHz 16-bit PCM WAV; `tests/music-local.test.ts` verifies RIFF/WAVE header, audible samples, prompt determinism and duration clamping.

- L6 (evidence): final ad-hoc arm64 rebuild produced `release/1.0.6/Open-Video-Craft-1.0.6-mac-arm64.dmg`; the app relaunched as PID `65963`, frontmost, with the `claude-local` marker present in the app bundle.
- L7 (evidence): 504 Vitest tests passed, plus typecheck, build, MCP smoke, FFmpeg verification, audit high and `git diff --check`.
