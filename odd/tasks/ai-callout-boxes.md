# AI callout boxes with animated in/out
Objective: let Claude/MCP add timed boxes with title, optional body, fully customizable visual style (background, border, radius, font, opacity) and animated in/out based on video topics. Also fix local Whisper transcription failing with `ENOTDIR`. Branch `feat/p0b-min-fork-identity`; no PR or merge. Test runner: Vitest, Node 22.

## Specs

- S1 User request (verbatim): "Devo poter aggiungere con l'AI ed MCP dei box con titolo ed eventuale testo in base agli argomenti di cui parlo nel video e che abbiano degli effetti animati in in/out. Ho provato ma mi dice che la trascrizione locale è fallita con errore Whisper ENOTDIR, Lo stile dei box devo poterlo decidere, ad esempio testo bianco sfondo blu in trasparenza, bordi arrotondati, font ben leggibile...".
- S2 Callout boxes must be first-class editor overlays with stable IDs, timing, optional title, optional body text, and style fields. Existing text overlays must keep working without migration.
- S3 Claude/MCP must be able to create, update and remove boxes through validated operations. Claude must derive topics from local analysis/transcript; no API key or cloud upload may be required for this path.
- S4 Preview and FFmpeg export must agree on title/body, transparency, border, radius, font family/weight and animated entrance/exit.
- S5 The local Whisper failure `ENOTDIR` must be reproduced from the packaged app path and fixed at the root cause, with a regression test.
- S6 Behavior changes ship with Vitest tests through public interfaces, and full local verification plus ad-hoc rebuild must pass.
- S7 User follow-up (verbatim): "C'è un bug, vorrei fare lo speedup sui silenzi della clip 2 come ho fatto sulla clip 3, ma dice che non può l'AI dato che riutilizza l'analisi che ha in cache". Cached analysis must be invalidated when the timeline, speed effects, subtitles or trim changes, not only when source files change.

## Tasks

- [x] T1 (S1, S5) Reproduce and fix Whisper `ENOTDIR`. Route: inline. Commit `9dbc680`, `7cf199d`, `6478c64`.
- [x] T2 (S1-S4) Define callout box model, validation and MCP operations with RED tests. Route: inline. Commit `2f21c29`.
- [x] T3 (S1-S4) Implement preview and FFmpeg animated rendering. Route: inline. Commit `2f21c29`.
- [x] T4 (S1-S4) Expose style controls and AI instructions. Route: inline. Commit `2f21c29`.
- [x] T5 (S1-S6) Verify, commit and rebuild local app. Route: inline. Pending final rebuild/launch evidence.
- [x] T6 (S7) Add timeline-aware analysis fingerprint and regression tests. Route: inline. Commit `7b83c5c`.

## Log

- L1 (user, verbatim): "Devo poter aggiungere con l'AI ed MCP dei box con titolo ed eventuale testo in base agli argomenti di cui parlo nel video e che abbiano degli effetti animati in in/out. Ho provato ma mi dice che la trascrizione locale è fallita con errore Whisper ENOTDIR, Lo stile dei box devo poterlo decidere, ad esempio testo bianco sfondo blu in trasparenza, bordi arrotondati, font ben leggibile...".
- L2 (user, verbatim): "C'è un bug, vorrei fare lo speedup sui silenzi della clip 2 come ho fatto sulla clip 3, ma dice che non può l'AI dato che riutilizza l'analisi che ha in cache". Observed `createFingerprint` hashes only source files and imports. AI then reuses `latest.json` even after timeline/speed edits; gap is not a transcription-cache correctness issue but an analysis-cache invalidation issue.

- L3 (evidence): packaged MCP `start_analysis` initially returned cached job `cached-308a50297e3c5abd2200` with the exact warning `Local transcription failed: ENOTDIR: not a directory, mkdir '.../app.asar/node_modules/@huggingface/transformers/.cache/onnx-community/whisper-base_timestamped/onnx'`.
- L4 (evidence): after the rebuild, a fresh packaged analysis wrote the Whisper cache under `~/Library/Application Support/Open Video Craft/model-cache/onnx-community/whisper-base_timestamped/onnx` and persisted `latest.json` with `warnings: []`, 413 transcript segments and fingerprint `db1879a8373cd1766995`. A repeat `start_analysis` correctly returned `cached-db1879a8373cd1766995`.
- L5 (evidence): `tests/analysis-fingerprint.test.ts` covers file, timeline, speed, zoom, text, subtitle and trim changes; 486 Vitest tests passed after the callout fixes, plus typecheck, build, MCP smoke, FFmpeg export test and `git diff --check`.
- L6 (decision): callout rendering uses rounded animated panels in timeline compositions and a rectangular `drawbox` fallback for single-source exports; `createVideoFilter` no longer emits an empty filter when a text overlay has no box.
