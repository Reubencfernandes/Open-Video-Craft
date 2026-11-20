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
| `swift test --package-path native/capture-poc` | BLOCKED: `xcode-select` is Command Line Tools; `no such module 'XCTest'` |
| `git diff --check b8428aa..9c70142` | exit 0 |
| Independent `gentle-ai-verify` | BLOCKED: provider quota failure before any finding; parent spot check only |

Work-unit commits: `5767b73` (G1), `718944e` (G2), `9c70142` (docs/config). Each had `gga` PASS. The independent verifier required by the named high-risk items did not run, so the high-risk verification is unmet rather than passed.

## Gate status

- `G1-CAPTURE`: **PARTIAL**. Protocol, manifest, arithmetic and dry-run are
  locally verified. Tier 1 T2/T3/T3E/T3X/T5 scenarios, topology M, drift,
  recovery and thermal/memory thresholds require the M1 8 GB target topology.
- `G2-RENDER`: **PARTIAL**. Local deterministic and final-file checks pass;
  hidden Electron target-runtime execution, OS-level hardware proof, long
  throughput runs and QuickTime/AVFoundation play remain external.
- `G-SIGN` / `G-TCC`: **BLOCKED_EXTERNAL** — no Developer ID identity
  (`0 valid identities found`), no target grants, no built-in camera.
- `G-DIST`: **BLOCKED_EXTERNAL** — no Team ID, no notarization credentials.

No threshold was weakened and no external gate was reported as a pass.
