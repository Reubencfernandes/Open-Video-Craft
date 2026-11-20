# G1-CAPTURE / G2-RENDER PoC implementation report

Branch `feat/p0b-min-fork-identity`; baseline HEAD `b8428aa`; RDD off.
Verdict: **PARTIAL** — the software PoCs are implemented and locally verified;
measurement and distribution gates need hardware, TCC and Apple credentials
that are not present on this machine.

## Implemented

### G1-CAPTURE
- `native/capture-poc/`: SwiftPM package with `ovc-capture-poc`, `OVCCaptureCore`
  and `OVCCaptureLive` targets, Swift 5 language mode on the Swift 6 toolchain.
- CLI `list`, `record --display all --camera <id>,<id> --mic <id>
  --system-audio sck|tap --codec hevc|h264 --fps 30|60 --duration <s>
  --out <dir> [--pause-at <s>:<s>] --dry-run` and `recover --out <dir>`.
- Protocol v1 JSONL events: `session.start`, `devices`, `stats` at 1 Hz,
  `track.first_pts`, `pauses`, `track.finalized`, `session.finalized`,
  plus `device.lost` in the live surface.
- Atomic `capture-session.json` manifest with decimal-string `…HostNs` values,
  pauses, rollover segments and track status.
- Live surface imports `ScreenCaptureKit`, `AVFoundation`, `VideoToolbox` and
  `CoreMedia`, and routes timestamps through `CMSyncConvertTime` onto one host-clock anchor.
- `src/shared/time/` and `src/shared/capture/`: exact tick arithmetic,
  `TimeMap`, `CaptureSession`, manifest conversion and strict protocol parsing.
- `scripts/bench/g1/run.mjs`: release build + deterministic dry-run harness.

### G2-RENDER
- `src/shared/render/`: typed scene model, deterministic `evaluateScene`,
  frame scheduler, VFR hold, cold seek, monotonic stepping, packet index,
  candidate decisions and bounded frame budgets.
- `src/renderer/render/compositor.ts`: WebGL2 surface, layer drawing,
  WebCodecs support probe and back-pressure accounting.
- `scripts/bench/g2/`: synthetic `lavfi` fixtures, elementary-stream final
  mux, ffprobe/full-decode validation and a report harness with no fabricated GO.
- `tests/render-poc*.test.ts`: public-interface tests for evaluator, scheduler,
  candidates, budgets and harness helpers.

## Verification evidence

| Command | Result |
|---|---|
| `npx vitest run` | 89 files, 436 tests passed |
| `npx tsc -p tsconfig.electron.json --noEmit` | exit 0 |
| `npx tsc -p tsconfig.renderer.json --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `swift build --package-path native/capture-poc` | Build complete |
| `swift build -c release --package-path native/capture-poc` | exit 0 via harness |
| `node scripts/bench/g1/run.mjs --dry-run --duration 5 --out <tmp>` | `PASS`, 19 events, 6 tracks, manifest v1, no live capture |
| `node scripts/bench/g2/run.mjs --self-test` | `PASS`, 1 check |
| `node scripts/bench/g2/run.mjs --quick --out <tmp> --report <tmp>/g2-report.json` | `PARTIAL`; finalized H.264+AAC MP4, 74,544 B, `faststart: true`, 15 checks |
| `./native/capture-poc/test.sh` | 14/14 Swift tests passed with CLT Swift Testing; no full Xcode install required |
| `npm test` (Node 22) | 89 files, 436 tests passed |
| `npm run typecheck` (Node 22) | exit 0 |
| `npm run build` (Node 22) | exit 0 |
| `npm run test:mcp` (Node 22) | MCP smoke test passed |
| `npm audit --omit=dev --audit-level=high` (Node 22) | exit 0; 2 moderate runtime advisories remain below the configured threshold |
| `npm run dist:mac:adhoc` (Node 22) | exit 0; x64 and arm64 DMG/ZIP/blockmaps produced; ad-hoc signature, TeamIdentifier not set |
| Packaged arm64 startup smoke | process alive after 8 s with isolated profile and blocked network; only the expected `ERR_PROXY_CONNECTION_FAILED` from the fork update check |
| `npx vitest run tests/auto-updates-config.test.ts` | 2/2 passed after adding the private-feed regression |
| Claude Code MCP registration | `claude mcp get open-video-craft`: `Connected`, user scope, stdio, no API key |
| Rebuilt app update smoke | pending final build |
| `git diff --check b8428aa..9c70142` | exit 0 |
| Independent `gentle-ai-verify` | DROPPED by owner; the earlier quota failure produced no finding |
| Remote CI for `cf0563c` | run `44783126468`: `completed/success`, all steps green |
| Remote CI for final push `b11b277` | run `44783265923`: `completed/success`, all steps green |

Work-unit commits: `5767b73` (G1), `718944e` (G2), `9c70142` (docs/config), `cf0563c` (verifier blocker), `b11b277` (push record), `f3f1e10` (final CI results). Each had `gga` PASS. The independent verifier is dropped by owner decision, not reported as passed. The branch was pushed as a strict fast-forward to `fork/feat/p0b-min-fork-identity`; no PR or merge was created.

## Gate status after owner revision

The owner explicitly dropped T4 and the hardware gates: "T4 lo salti. T6.
Lascia perdere per il test lo faccio io a mano poi, per ora la app serve a me
in locale, basta che riusciamo poi a buildarla. Per lo swift test, installa
tutto ciò che serve come XCTest. I gate hw non so cosa siano, basta che
l'app funzioni su questo mac studio M5 Max con 36gb di ram".

- Target: **this Mac Studio M5 Max / 36 GB**; the M1/8 GB topology matrix is
  no longer an active blocker by owner decision.
- `G1-CAPTURE`: **PARTIAL**. Protocol, manifest, arithmetic, 14 Swift tests and
  dry-run are locally verified; live capture is not claimed.
- `G2-RENDER`: **PARTIAL**. Local deterministic checks and final-file mux pass;
  long runtime measurement and manual playback were not performed.
- `G-SIGN` / `G-TCC` / `G-DIST`: **not pursued** by owner decision; no
  notarization result is claimed.
- Swift tests use Swift Testing, already provided by the installed Command Line
  Tools; `native/capture-poc/test.sh` configures the framework paths so a full
  Xcode installation is unnecessary. `./native/capture-poc/test.sh` passes
  14/14 tests, and the CMTime-to-host-clock conversion remains exact with
  128-bit integer arithmetic.
- Local application: `npm run build` produces the renderer, and
  `npm run dist:mac:adhoc` produces installable ad-hoc artifacts for this
  Mac Studio. The arm64 packaged binary starts and stays alive; no hardware
  gate is required for this outcome.

No threshold was weakened and no external gate was reported as a pass.
