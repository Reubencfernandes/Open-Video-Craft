# ADR-0001: Native macOS capture through a standalone Swift helper

- **Status:** Proposed. Conditional on the P1 proof of concept and on gates G-SIGN and G-TCC.
- **Date:** 2026-11-15
- **Deciders:** Project owner
- **Plan reference:** [0000](0000-architecture-roadmap.md) §2b, §2d, §2e, §2g, §4, ADR-1/2/3, phases P1, P2, P4

## Context

Capture today runs entirely in Chromium: up to four `MediaRecorder` instances produce software-encoded VP9 WebM, with no per-track timestamps, no crash recovery, and an unverified system-audio path on macOS. The target is a MacBook Pro M1 with 8 GB RAM, minimum macOS 14.2, shipped as a signed and notarized DMG.

## Decision

Capture moves to **one** standalone Swift helper process (`ovc-capture`), supervised by Electron main over a versioned JSON-lines protocol on stdio. Media never crosses IPC: the helper writes files into a session directory chosen by main and reports metadata.

- Displays: ScreenCaptureKit, one stream per display. System audio: ScreenCaptureKit `capturesAudio` (Core Audio process taps deferred).
- Cameras: approach chosen by test among the candidates in plan §2g. `AVCaptureMultiCamSession` is **not listed for macOS** in Apple's documentation (Mac Catalyst 14 only), so independent `AVCaptureSession`s are a leading candidate, not an assumption.
- Microphone: AVFoundation audio capture. Encode: VideoToolbox through `AVAssetWriter`; crash-safe container decided by test (fragmented `.mov`, CMAF segments, or segmented files).
- One host clock; per-track first-sample times and per-device sync offsets in a session manifest; stored as `…HostNs` (see ADR-0004).
- Single-helper rule: later native needs become subcommands of the same binary, never new resident processes.

## Conditions (nothing below is assumed)

| Gate | Question | Fallback |
|---|---|---|
| P1 PoC, topology M (2 displays, 2 cameras, 1 microphone, system audio) | Mandatory capabilities M1–M7 met within the memory, disk and sync budgets | Chromium capture for the failing capability |
| G-SIGN | Helper carries its own entitlements, is notarized, and still captures | Signing method A → B → C → nested helper `.app` |
| G-TCC | One permission entry per capability, under the app's name | Layouts L1 → L2 → L3, permission requests from main, in-process addon |
| OS coverage | Gates run on 14.2 and 15 hardware | Raise the minimum macOS to the lowest tested version |

## Consequences

- Easier: crash containment, hardware encoding, per-track timestamps, no Electron-ABI coupling.
- Harder: a second language and toolchain, an extra signed binary, TCC and signing experiments before integration.
- Revisit if G-SIGN or G-TCC fail on every layout (ADR-2 is then reopened in favor of an in-process addon).
