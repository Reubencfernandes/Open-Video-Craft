# Export fails on apostrophes in overlay text
Objective: fix export error `No such filter: '0'` caused by apostrophes in callout/text overlay text. Branch `feat/p0b-min-fork-identity`; no PR or merge. Test runner: Vitest, Node 22.

## Specs

- S1 User request (verbatim): "durante l'export da errore No such filter '0'".
- S2 Text overlays and callout titles/bodies containing apostrophes must export successfully.
- S3 Existing text escaping for colons, percent signs and newlines must keep working.
- S4 Behavior changes ship with Vitest tests through public interfaces; full verification and an ad-hoc rebuild must pass.

## Tasks

- [x] T1 (S1, S2) Add a failing export test with apostrophe text. Route: inline.
- [x] T2 (S1-S3) Fix drawtext escaping. Route: inline.
- [x] T3 (S1-S4) Verify, commit and rebuild/relaunch the app. Route: inline. Final rebuild and relaunch verified.

## Log

- L1 (user, verbatim): "durante l'export da errore No such filter '0'".

- L2 (evidence): `escapeDrawtextText` replaced ASCII apostrophes with `\'` inside single-quoted filter options, so FFmpeg parsed the rest of the text as a new filter named `0`. It now uses the typographic apostrophe `’`. A regression export with `l'economia: 100%` passes, and the real full 1080p project export produced 1,462,342,020 bytes.

- L3 (evidence): final ad-hoc build relaunched the app as PID `30279`, frontmost with window `Open Video Craft`.
