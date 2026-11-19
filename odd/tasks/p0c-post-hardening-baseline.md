# P0c — Post-hardening baseline

Objective: re-measure the P0b-min fork against the frozen original baseline, add the in-repo benchmark harness, and record an evidence-backed delta report.
Branch: `feat/p0b-min-fork-identity`; delivery: work-unit commits only, no push or merge without the owner.

## Specs

- S1 User request (verbatim): "Abbiamo finalmente spazio sul disco primario, continua le lavorazioni fino al totale completamento dell'app".
- S2 From `IMPLEMENTATION_PLAN.md` §P0c: "Rerun the same scenarios with the same external harness."
- S3 From `IMPLEMENTATION_PLAN.md` §P0c: "Add the in-repo harness (`scripts/bench/`, `--bench` bench-only IPC channel) and cross-validate it against the external one on one scenario (agree within 5% [P]) before it gates regressions."
- S4 From `IMPLEMENTATION_PLAN.md` §P0c: "Output: delta report original → post-P0b-min isolating the Electron bump and arm64-only (ACE-Step removal is measured separately when hygiene lands)."
- S5 From `IMPLEMENTATION_PLAN.md` §P0a: "Failures are **recorded, not fixed**." Baseline results must report real pass/fail and must not claim unrun hardware or interactive scenarios.

## Tasks

- [x] T1 (S1, S2) Reconstruct the Node 22 environment, install exact lockfile dependencies, and record machine/toolchain/disk evidence. Route: inline. Commit: N/A (environment only). Evidence: `npm ci` exit 0 (678 packages, 11 s); Electron 43.8.10 binary installed explicitly; Node 22.23.1; raw environment and logs frozen.
- [x] T2 (S2, S5) Run static baseline checks, the full test suite three times, build, MCP smoke, and FFmpeg capability checks; preserve all failures. Route: inline. Commit: N/A (verification evidence). Evidence: all checks exit 0; 83 files and 393/393 tests passed identically x3; build, MCP smoke and three VideoToolbox encoders verified. Known renderer chunk warning (735.18 kB) retained.
- [x] T3 (S2, S5) Run startup and every safely automatable original runtime scenario with the external harness; mark interactive or unavailable scenarios explicitly. Route: inline. Commit: N/A (verification evidence). Evidence: three isolated startup runs completed; renderer 0.546/0.298/0.296 s, RSS medians 491.1/466.6/470.6 MB. Original harness path was absent, so a temporary equivalent was reconstructed from frozen methodology. B2o/B7o/B8o remain unrun as in the accepted reduced original baseline.
- [x] T4 (S3, S5) Implement the bench-only harness and focused tests, then cross-validate one common scenario against the external measurement. Route: inline. Commit: pending. Evidence: 9 focused tests pass; cross-validation 0.695% (467.328 MB IPC vs 470.6 MB external median) below the 5% [P] threshold; normal-startup differential identical; typecheck, build and a short real `--bench` smoke pass.
- [x] T5 (S4, S5) Produce the original-to-post-hardening delta report, freeze raw evidence/checksums, and document pending hardware gates. Route: inline. Commit: pending. Evidence: `docs/baseline/post-hardening/REPORT.md`, `MANIFEST.sha256`; final suite 84 files, 402/402 tests, exit 0.

## Log

- L1 (2026-11-19, user, verbatim): "Abbiamo finalmente spazio sul disco primario, continua le lavorazioni fino al totale completamento dell'app".
- L2 Recovered reviewed P0b-min commits `0e00e31`, `467b2b8`, `818c2b9`, and `a97a700` from the owner-authorized read-only source `<owner-authorized read-only source checkout>`; no source repository mutation, push, or merge.
- L3 Disk evidence at resume: 723 GiB available on the primary volume; `node_modules` absent in this checkout.
- L4 Hardware differs from the frozen baseline: Mac Studio M5 Max, 36 GB, macOS 27.2.1 versus M1, 8 GB, macOS 26.5.2. Performance deltas cannot isolate Electron or arm64-only effects.
- L5 `npm ci` completed but did not run Electron's binary installer; `node node_modules/electron/install.js` completed successfully and `electron --version` reported 43.8.10. This is environment setup, not a source fix.
- L6 Static baseline completed successfully: `verify:ffmpeg`, `typecheck`, `vitest` x3 (83 files, 393/393 tests each), `build`, `test:mcp`; `h264_videotoolbox`, `hevc_videotoolbox`, and `prores_videotoolbox` present. No lint script exists. Renderer chunk warning remains 735.18 kB.
- L7 `<external bench tools directory>` was absent on this Mac after the owner authorized its use. A temporary external harness was reconstructed from the frozen report: process-tree RSS/CPU at 1 Hz, 10 s settle, 40 s samples, three sequential isolated profiles. It is not represented as the original harness.
- L8 Startup logs show only `[auto-update] Skipping update checks in development.` and repeated macOS `Window move completed without beginning` warnings. `footprint` snapshots (63-64 MB) cover only the main process and are not comparable with the prior 196-198 MB aggregate figures. B2o recording, B7o export, B8o transcription, packaged-build and `powermetrics` measurements remain open.
- L9 Independent verifier statically confirmed the bench guard, snapshot arithmetic, profile isolation and docs; its configured mode blocked it from running commands. All requested execution checks were then run by the parent and recorded in `bench-focused-tests.log`. Advisories about preflight, portability, invalid arguments, stale output, empty metrics and misleading uptime naming were resolved; cross-validation is explicitly method-limited (one fresh IPC run vs the median of three earlier external runs).
- L10 Final verification: 84 test files, 402/402 tests passed; typecheck, build, focused bench checks and MCP smoke passed. Final 9/9 focused checks, typecheck and `git diff --check` passed after type-guard cleanup. Delta report and SHA-256 manifest generated and verified; machine identifiers and owner-specific absolute paths were redacted from all committed evidence after a pre-commit review finding. Hardware gates and distribution remain open by design.
