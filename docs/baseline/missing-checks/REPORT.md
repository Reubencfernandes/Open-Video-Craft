# Missing checks — final verification report

- **Date:** 2026-11-20.
- **Branch:** `feat/p0b-min-fork-identity`.
- **Baseline HEAD:** `3981cea`.
- **Machine:** Mac Studio M5 Max, 36 GB, macOS 27.2.1, arm64, 543 GiB free at resume.
- **Owner decisions:** remote CI read, full hardware gates attempted, `powermetrics` handoff command, Whisper model download.
- **RDD:** off by explicit owner decision.
- **Raw evidence:** `raw/`.

## 1. Remote CI — PASS

Authorized read-only `gh` checks on `micio86dev/openvideocraft`.

- `gh run list --repo micio86dev/openvideocraft --branch feat/p0b-min-fork-identity --limit 10 --json ...`: exit 0.
- Latest push run for HEAD `3981cea`: databaseId `44722091832`, name `CI`, event `push`, status `completed`, conclusion `success`, created `2026-11-20T10:46:47Z`, updated `2026-11-20T10:47:22Z`.
- `gh run view 44722091832 --repo micio86dev/openvideocraft --json databaseId,conclusion,status,url,jobs,attempt`: exit 0; all job steps `completed/success`.
- Evidence: `raw/gh-runs.json`, `raw/gh-run-44722091832.json`.

Previous branch run `44721915671` for `55f9860` also `success`.

## 2. Local static checks — PASS

Commands run with Node 22.23.1 / npm 10.9.8 via nvm; default shell Node is 24.18.0.

| Check | Exit | Evidence |
|---|---:|---|
| `npm ci --no-audit --no-fund` | 0 | `raw/npm-ci.log` |
| `node node_modules/electron/install.js` | 0 | `raw/electron-install.log` |
| `npm run verify:ffmpeg` | 0 | `raw/verify-ffmpeg.log` |
| `npm run typecheck` | 0 | `raw/typecheck.log` |
| `npx vitest run --reporter=verbose` x3 | 0 | `raw/vitest-1.log`, `raw/vitest-2.log`, `raw/vitest-3.log` |
| `npm run build` | 0 | `raw/build.log` |
| `npm run test:mcp` | 0 | `raw/test-mcp.log` |
| `npm audit --omit=dev --audit-level=high` | 0 | `raw/audit-runtime.log` |
| `npm run bench:startup -- --settle 10 --samples 40` | 0 | `raw/in-repo-startup/` |
| frozen manifest SHA-256 checks, original + post-hardening | 0 | `raw/original-manifest-check.txt`, `raw/post-manifest-check.txt` |
| `git diff --check` | 0 | `raw/static-summary.txt` |

Startup harness: 40 samples, median working set **460.05 MB**, min 457.39 MB, max 462.42 MB, first uptime 0.346 s, no bench errors.

Full audit remains informational: `{"info":0,"low":0,"moderate":7,"high":17,"critical":2,"total":26}`; runtime audit has **0 high / 0 critical**. The 17 high / 2 critical are dev-tooling advisories.

## 3. Packaged ad-hoc build and startup — PASS

- `npm run dist:mac:adhoc` with Node 22: exit 0, evidence `raw/dist-mac-adhoc.log`.
- Produced DMG/ZIP, arm64 + x64 blockmaps and `latest-mac.yml`; list in `raw/packaged-artifacts.txt`.
- `codesign -dv --verbose=2 "release/1.0.6/mac-arm64/Open Video Craft.app"`: exit 0. Bundle identifier `dev.micio86dev.openvideocraft`, `Signature=adhoc`, `TeamIdentifier=not set`, hardened runtime flag present.
- `spctl -a -vv`: `rejected`, expected for ad-hoc non-notarized build.
- Network-blocked startup with isolated user data: exit 0. `ELECTRON_ENABLE_LOGGING=1` log in `raw/packaged-startup-network-blocked.log`. The app attempted the fork update check and failed with `net::ERR_PROXY_CONNECTION_FAILED`, proving no usable external feed under the blocked proxy. No upstream feed URL was contacted.
- First `sandbox-exec` attempt failed because the profile also denied Chromium's local singleton socket; evidence preserved in `raw/packaged-startup.log`; corrected by using a dead local proxy plus host-resolver rules rather than denying local sockets.

## 4. B2o / B7o / B8o — PASS

### B2o real capture

All four captures with bundled FFmpeg exited 0. Evidence: `raw/b2o/b2o-summary.txt`, per-source logs and `raw/b2o/probe.txt`.

- Screen: `screen.mp4`, 5.00 s, H.264, 1920x1080, 5.20 fps.
- Camera: `camera.mp4`, 4.97 s, H.264, 3440x1440, 30.20 fps.
- Mic: `mic.wav`, 4.88 s, PCM s16le mono 48 kHz.
- System audio via BlackHole: `system.wav`, 4.83 s, PCM s16le stereo 48 kHz.

No TCC errors occurred. These are short smoke captures, not the 30/60/120-minute gate scenarios.

### B7o real export

Standalone `exportTimelineComposition` check with synthetic clips: exit 0. Evidence `raw/b7o-export.log`, output under `raw/b7o/`.

- Output: `export.mp4`, 498,443 bytes.
- Duration: 6000 ms.
- Wall clock: 486 ms.
- Realtime factor: **12.35x**.
- Contains both video and audio.
- Included crossfade, zoom, text overlay and subtitle sidecar input.

### B8o Whisper transcription

Authorized model download and real local inference: exit 0. Evidence `raw/b8o-transcription.log`.

- Model: `onnx-community/whisper-base_timestamped`.
- `modelReadyMs`: 2867.
- `inferenceMs`: 422.
- Audio: 4.839125 s generated locally with `say` and converted to 16 kHz mono PCM.
- Transcript: ` Open Video TRIFT Verification, the Quick Brown Fox Unbsouver de Lazy Dog.`
- Interpretation imperfect but the download, model initialization, inference and timestamped chunk output all work. No cloud STT was used.

## 5. G0, G1, G2, G-SIGN/G-TCC, powermetrics — BLOCKED

Owner chose "Gate completi", but the full gate matrix cannot be executed as a check because the required implementation and hardware topology are absent.

### Structural blockers

- `native/capture-poc/` absent: no SwiftPM `ovc-capture-poc`, no `SCStream`/`AVCaptureSession`/`AVAssetWriter` helper, no protocol v1 JSONL, no crash-recovery manifest.
- `src/renderer/render/` and `src/shared/render/` absent: no WebGL2/WebCodecs compositor, no hidden-renderer R1–R15 harness, no mux candidates M1/M2/M3.
- Swift toolchain exists (`Apple Swift version 6.3.3`), but there is no gate code to build.
- `IMPLEMENTATION_PLAN.md` requires G1 and G2 measurement runs never overlap, G1 before G2, and at least one real G1 helper output for G2 R3. Neither prerequisite exists.

### Hardware blockers

- This machine is **M5 Max / 36 GB**, not the target M1 / 8 GB from the ratified budgets.
- Display inventory: one external LG HDR WQHD 3440x1440. Mandatory topology M requires two displays: internal 2560x1600 and external 3440x1440.
- Camera inventory: Angetube Live Camera and OBS Virtual Camera. Mandatory topology M requires built-in FaceTime HD plus one USB camera; Mac Studio has no built-in camera.
- Audio inventory is usable: Fifine Microphone, external microphone, BlackHole 2ch, camera audio, Microsoft Teams Audio.
- Therefore T2/T3/T3E/T3X/T5/T6/T7/T9/T12 and the thermal matrix cannot be reproduced faithfully.

### TCC / G-SIGN / G-TCC

Short FFmpeg captures succeeded, so basic screen/camera/mic access is available in this environment. The formal G-SIGN and G-TCC matrices require a signed nested helper, helper entitlements, Finder/Dock/dev launch cells, fresh-account/relaunch states and revocation detection. No helper exists; those gates were not run.

### powermetrics

`sudo -n true` is unavailable in this session, so the thermal/power run is delegated to the owner. Exact command:

```sh
sudo powermetrics --samplers cpu_power,gpu_power,thermal -i 1000 -n 3600 > "<repository root>/docs/baseline/missing-checks/raw/powermetrics.txt" 2>&1
```

Also saved at `raw/powermetrics-command.txt` and `/tmp/ovc-powermetrics-command.txt`.

`G0-THRESHOLDS` numbers are ratified by ADR-15 but remain unmeasured: measuring them requires the missing G1/G2 scenarios on the target machine. No ADR claims measured acceptance.

## 6. G-DIST — BLOCKED

- `security find-identity -v -p codesigning`: `0 valid identities found`.
- `node scripts/check-mac-signing.mjs`: exit 1, `Missing Developer ID Application signing certificate.`
- `node scripts/verify-mac-release.mjs`: exit 1, `OVC_MAC_TEAM_ID is not set. Release verification needs the Apple Team ID the archives were signed with; ad-hoc builds cannot be verified as notarized releases.`
- Owner previously confirmed no Apple Developer Program membership, Developer ID certificate or notarization credentials.
- Therefore signed/notarized/stapled DMG, `spctl` acceptance, notarized `G-TCC` re-confirmation and fork update-feed testing are impossible. The ad-hoc DMG/ZIP above is local-use only.

## 7. Independent verifier — UNAVAILABLE

Earlier `gentle-ai-verify` and `jd-judge-a` timed out awaiting child bash permission. Attempts to dispatch `review-reliability` in this run were rejected by the runtime with `review subagent dispatch contains an unsupported input field`. No independent verifier result was invented. Parent-run deterministic checks, `gga` pre-commit reviews and the green remote CI stand as available evidence.

## 8. Final status

Completed and verified: remote CI, local static suite and audits, frozen manifests, packaged ad-hoc build, packaged startup with network blocked, B2o real short capture, B7o real FFmpeg export, B8o real Whisper model download and inference, G-DIST prerequisite check, hardware inventory and `powermetrics` handoff.

Not completed because blocked by missing implementation, incompatible hardware topology or external credentials: full G1-CAPTURE, G2-RENDER, G-SIGN/G-TCC matrices, G0 threshold measurement, `powermetrics` execution, and G-DIST. These are not test failures; they are documented prerequisites. No merge or PR was created, and this report does not claim the full Revision 4 roadmap is complete.

Risk: item 4 (concurrency/hardware gates), item 5 (delivery/signing), item 6 (no automated regression test can cover the missing native capture/render gates).
