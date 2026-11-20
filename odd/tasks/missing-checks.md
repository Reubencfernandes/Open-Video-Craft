# Missing checks — complete remaining verification

Objective: run every remaining verification listed as open after P0c/P0b-hygiene, and record exact evidence for checks that cannot be completed.
Branch: `feat/p0b-min-fork-identity`; baseline HEAD `3981cea`; no merge or PR.

## Specs

- S1 User request (verbatim): "fai tutti i controlli mancanti".
- S2 Owner decisions (verbatim): "Autorizza lettura remota", "Gate completi", "Ti passo il comando", "Autorizza download".
- S3 From `docs/baseline/post-hardening/REPORT.md`: "The accepted original baseline was itself reduced (static + startup only). The Revision 4 plan additionally names B2o recording, B7o export, B8o transcription, packaged-build measurement, `powermetrics`, `G0-THRESHOLDS`, and the hardware gates. Those remain open."
- S4 From `IMPLEMENTATION_PLAN.md` §3: "Measurement runs never overlap." and "Hardware benchmarks ... dedicated M1 8 GB self-hosted runner".
- S5 From `IMPLEMENTATION_PLAN.md` §7: `G-DIST` prerequisites include "a paid Apple Developer Program membership", "a Developer ID Application certificate", and "Notarization credentials".

## Tasks

- [x] T1 (S1, S2) Check remote GitHub Actions status for `micio86dev/openvideocraft` on `feat/p0b-min-fork-identity` using the already-configured `gh` session. Route: inline. Evidence: `gh run list` and `gh run view` exit 0; latest push run `44722091832` for HEAD `3981cea` is `completed/success`; all job steps success; run URL recorded in `docs/baseline/missing-checks/raw/gh-run-44722091832.json`.
- [x] T2 (S1, S3) Repeat local static checks: Node 22 environment, full tests x3, typecheck, build, MCP smoke, runtime/full audit, FFmpeg verification, manifest checks, and diff-check. Route: inline. Evidence: `npm ci`, Electron installer, `verify:ffmpeg`, `typecheck`, `vitest` x3, `build`, `test:mcp`, runtime audit, 40-sample startup bench, original/post manifests and `diff --check` all exit 0; full audit records 17 high/2 critical dev-tooling advisories; startup median working set 460.05 MB, no bench errors.
- [x] T3 (S1, S3) Run packaged ad-hoc build and an unpackaged/packaged startup smoke with isolated user data. Route: inline. Evidence: `dist:mac:adhoc` exit 0; DMG/ZIP/blockmaps present; `codesign` ad-hoc with `TeamIdentifier=not set`; `spctl` rejected as expected; network-blocked startup logged only fork-update `ERR_PROXY_CONNECTION_FAILED`.
- [x] T4 (S1, S2, S3) Run B2o recording, B7o export and B8o transcription checks, including the authorized Whisper model download where required. Route: inline. Evidence: four real FFmpeg captures exit 0; B7o export 6 s in 486 ms with video/audio; B8o model ready 2867 ms, inference 422 ms, timestamped transcript returned.
- [x] T5 (S1, S2, S3, S4) Assess and run the full G1-CAPTURE/G2-RENDER gate prerequisites; record hardware inventory, TCC constraints and `powermetrics` handoff command. Route: inline. Evidence: preflight complete; full gate runs blocked because `native/capture-poc/`, `src/renderer/render/` and `src/shared/render/` are absent, the machine has one display and no built-in camera, and `sudo -n` is unavailable. Exact handoff command saved.
- [x] T6 (S1, S5) Verify `G-DIST` prerequisites and produce the final missing-checks report with pass/fail/skipped evidence. Route: inline. Evidence: `check-mac-signing` exit 1 for missing Developer ID certificate; `verify-mac-release` exit 1 for missing `OVC_MAC_TEAM_ID`; final report `docs/baseline/missing-checks/REPORT.md`.
- [ ] T7 (S1, S2, S4) Implement the missing G1 SwiftPM capture PoC, G2 WebCodecs/WebGL2 hidden-renderer PoC, G-SIGN/G-TCC matrices and target-hardware measurement harness. Route: blocked. Commit: pending. Blocker: this is multi-slice roadmap implementation, not a missing check; requires owner decision and compatible M1/8 GB two-display/two-camera hardware.

## Log

- L1 (2026-11-20, user, verbatim): "fai tutti i controlli mancanti".
- L2 Environment at resume: HEAD `3981cea`, branch `feat/p0b-min-fork-identity`, RDD off, 543 GiB free, M5 Max/36 GB/macOS 27.2.1, Node default v24.18.0 with Node 22 available through nvm, `sudo -n` unavailable, `gh` available.
- L3 Owner authorized remote read of GitHub Actions, full hardware gates, a `powermetrics` handoff command, and Whisper model download.
- L4 T1/T2 completed. Structural preflight for T5: `native/capture-poc/`, `src/renderer/render/` and `src/shared/render/` are absent; hardware inventory shows one external 3440x1440 display, Angetube Live Camera, OBS Virtual Camera, Fifine/external/BlackHole audio devices. Mandatory G1 topology M requires two displays and built-in + USB cameras, so the full gate topology cannot be reproduced on this machine without missing native PoC work.
- L5 T3/T4 completed; first packaged sandbox profile blocked Chromium local sockets and was corrected with a dead local proxy plus host-resolver rules. First B8o script failed from `/tmp` ESM package resolution and was corrected with an absolute package import.
- L6 T5/T6 preflight and report completed. Independent verifier remains unavailable: earlier subagents timed out on child bash permission and `review-reliability` dispatch was rejected with `review subagent dispatch contains an unsupported input field`.
- L7 RDD remains off by owner decision; no merge or PR created.
