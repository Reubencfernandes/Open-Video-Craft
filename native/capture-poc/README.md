# G1-CAPTURE proof of concept

Isolated SwiftPM helper, no Electron and no UI. It implements the capture
protocol v1, the shared host-clock anchor and the exact tick arithmetic used by
the importer. The dry-run path is deterministic and never asks for TCC access.

## Commands

```sh
swift build -c release --package-path native/capture-poc
native/capture-poc/.build/release/ovc-capture-poc list
native/capture-poc/.build/release/ovc-capture-poc record \
  --display all --camera cam-1,cam-2 --mic mic-1 --system-audio sck \
  --codec hevc --fps 30 --duration 5 --out /tmp/ovc-g1 --dry-run
native/capture-poc/.build/release/ovc-capture-poc recover --out /tmp/ovc-g1
node scripts/bench/g1/run.mjs --dry-run --duration 5 --out /tmp/ovc-g1
```

`--pause-at <s>:<s>` is accepted by `record` and appears as a `pauses` event
and a capture-axis gap in the manifest (pause method B).

## Language mode

`Package.swift` selects Swift 5 language mode with the Swift 6 toolchain so the
ScreenCaptureKit / AVFoundation delegate objects do not require speculative
`Sendable` annotations before the gate has measured anything. No behavior is
weakened by this choice.

## Live path boundaries

`Sources/OVCCaptureLive` contains the ScreenCaptureKit stream, independent
`AVCaptureSession` cameras, `AVAssetWriter` + VideoToolbox hardware-required
encoding, LPCM/CAF audio and the CoreMedia-to-host-clock bridge. A live run
requires the app's TCC grants and the target topology; it is deliberately not
invoked by the harness on a machine without those grants. The harness reports
`BLOCKED_EXTERNAL`, never a hardware GO.

Swift unit tests use Swift Testing, which ships with the installed Command
Line Tools. Because SwiftPM does not add its framework paths to the test bundle
automatically on CLT-only systems, run `./native/capture-poc/test.sh`: it sets
`DYLD_FRAMEWORK_PATH`/`DYLD_LIBRARY_PATH` and the required linker rpaths, then
executes `swift test`. All 14 Swift tests pass on this Mac Studio without
installing the full Xcode IDE.

## G-SIGN / G-TCC status

| Cell | Status |
|---|---|
| Helper signed with its own entitlements under hardened runtime | BLOCKED_EXTERNAL: no Developer ID identity; `0 valid identities found` |
| Camera + microphone capture under hardened runtime | BLOCKED_EXTERNAL: no built-in camera, no TCC grants for an ad-hoc helper |
| One permission entry per capability under the app name | BLOCKED_EXTERNAL: needs fresh account and relaunch on target hardware |
| Revocation detected within 2 s | BLOCKED_EXTERNAL: needs target hardware |

The dry-run does not request camera, microphone or screen permission.
