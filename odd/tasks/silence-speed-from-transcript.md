# Speed up true non-speech gaps
Objective: make "speed up silences" act only on moments where the owner is not speaking, using the local transcript/voice activity instead of raw energy detection that reacts to wind. Branch `feat/p0b-min-fork-identity`; no PR or merge. Test runner: Vitest, Node 22.

## Specs

- S1 User request (verbatim): "La velocizzazione dei momenti morti non va bene per nulla, velocizza totalmente a caso, dovrebbe farlo nei punti in cui non parlo".
- S2 Silence candidates for speed-up must be derived from local Whisper transcript gaps, optionally combined with energy detection, and must exclude intervals overlapping speech segments.
- S3 Existing `silenceRanges` shape must remain compatible.
- S4 AI/MCP instructions must tell Claude to use the bounded silence query and choose only non-speech ranges.
- S5 Behavior changes ship with Vitest tests through public interfaces; full verification and an ad-hoc rebuild must pass.

## Tasks

- [x] T1 (S1-S3) Derive silence ranges from transcript gaps and exclude overlapping speech. Route: inline.
- [x] T2 (S4) Update assistant instructions if needed. Route: inline.
- [x] T3 (S1-S5) Verify, commit and rebuild/relaunch the app. Route: inline. Pending final rebuild evidence.

## Log

- L1 (user, verbatim): "La velocizzazione dei momenti morti non va bene per nulla, velocizza totalmente a caso, dovrebbe farlo nei punti in cui non parlo".

- L2 (evidence): `deriveNonSpeechRanges` now uses Whisper timestamp gaps as the primary source for `silenceRanges`; energy-based `silencedetect` remains only a fallback when no transcript exists. Assistant instructions explicitly forbid speeding ranges that overlap speech.
