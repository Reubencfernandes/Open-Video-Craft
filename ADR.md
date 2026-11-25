# ADR — Architecture Decision Records (Revision 4)

Consolidated records for the macOS fork of Open Video Craft. Baseline `main` @ `143a0d6`. Planning only.

- Per-ADR long forms live in `docs/adr/0001…0008` and `docs/adr/0000-architecture-roadmap.md` (Revision 2); they are **not modified**. Where they differ, this file, `ARCHITECTURE.md`, `DATA_MODEL.md` and `IMPLEMENTATION_PLAN.md` (all Revision 4) win; the supersession table below lists every difference found.
- **Status vocabulary:** *Proposed* (not yet measured or gated) · *Accepted* (gate passed, evidence recorded in the ADR). **No ADR is Accepted.** Revision 3 also used *Decided*; it is retired, because every decision below still depends on a gate or a test (the time model on the P3.1 property tests, for example). `docs/adr/0000` §13 "Already decided (not conditional)" is superseded: **nothing is decided without evidence**.
- Tags: **[V]** verified in code · **[S]** static · **[H]** hypothesis · **[P]** proposed.
- **Gate names** are defined once, with criteria, in `IMPLEMENTATION_PLAN.md` §2.1: `G0-THRESHOLDS`, `G1-CAPTURE`, `G2-RENDER`, `G-SIGN`, `G-TCC`, `G-MCP`, `G-DIST`, `J1`.

| # | Decision | Status | Gate |
|---|---|---|---|
| 1 | Native capture on ScreenCaptureKit + AVFoundation + VideoToolbox | Proposed | `G1-CAPTURE` (Tier 1 scenarios), `G-SIGN`, `G-TCC` |
| 2 | Swift **capture** helper process (no MCP), not an in-process addon | Proposed | `G-SIGN`, `G-TCC`, `G1-CAPTURE` |
| 3 | Synchronization: host clock + per-source `TimeMap` + `CaptureSession` (single representation) | Proposed | `G1-CAPTURE` T6, T9, drift run; `DATA_MODEL.md` §6.3 property tests |
| 4 | Shared scene evaluator + WebGL2 compositor, pinned Electron | Proposed | `G2-RENDER` R1–R10, R13–R15 |
| 5 | Media pipeline: index/demux, WebCodecs decode/encode, ffmpeg audio and final mux | Proposed | `G2-RENDER` R3, R6, R13, R14; `G1-CAPTURE` T3 |
| 6 | AI/MCP: TypeScript `ovc-mcp` ↔ Main gateway, one document authority | Proposed | `G-MCP`, P3.9, P9 background-launch test |
| 7 | Distribution, fork identity, licensing, signing prerequisites | Proposed | Specialist review, `G-DIST` |
| 8 | Time model: flick ticks, `bigint` arithmetic, per-boundary exactness | Proposed | P3.1 property tests |
| 9 | One `AudioMixPlan` | Proposed | P7 numeric parity |
| 10 | Footprint-based budgets ratified before gates | Proposed | `G0-THRESHOLDS`, P0a baseline |
| 11 | Editor domain v3 as single mutation path, behind the gates | Proposed | Per-slice tests, P3.9 latency |
| 12 | Gate-driven roadmap (two decisive capabilities first) | Proposed | `G1-CAPTURE`, `G2-RENDER` outcomes |
| 13 | Clip timing and typed, versioned transition/effect registry | Proposed | P3.1 property tests, P7 audio-retime quality |

### Numbering map (three schemes existed in Revision 3)

| `ADR.md` | `docs/adr/` file | `docs/adr/0000` location |
|---|---|---|
| 1 Native capture | `0001-native-capture` | ADR-1, §2b, §2g |
| 2 Swift/Electron integration | `0001-native-capture` (integration) | ADR-2, §2e |
| 3 Synchronization | `0001-native-capture` (clock), `0004-time-model` | ADR-3 |
| 4 Compositor | `0002-rendering-parity` | ADR-4, §2i |
| 5 Media pipeline | `0002-rendering-parity` (partial) | ADR-4 design, §2b "Rendering" |
| 6 AI/MCP | `0005-mcp-and-ai-architecture` | ADR-7, §2h, §8 |
| 7 Distribution | `0007-distribution-and-licensing` | ADR-8 |
| 8 Time model | `0004-time-model` | §2c |
| 9 Audio | `0006-audio-pipeline` | ADR-6 |
| 10 Budgets | `0008-performance-and-memory-budgets` | §2f, §2j |
| 11 Domain v3 | `0003-editor-domain-v3` | ADR-5 |
| 12, 13 | — (new in Revision 4) | — |

### Supersession table (Revision 4 overrides these statements)

| Where | Revision 3 / Revision 2 statement | Revision 4 |
|---|---|---|
| `0000` §13, `0004` status | Time model "Already decided" / "decided in principle" | Proposed; gate = P3.1 property tests (ADR-8) |
| `0000` §13 | "single-helper rule, arm64-only, one authoritative domain implementation" already decided | Single-helper rule replaced by the native capture rule (ADR-2); nothing is decided without evidence |
| `0000` ADR-5 | `MediaSource.captureOffsetTicks`, `driftPpm` | **Removed**; `timeMap` + `CaptureSession` (ADR-3) |
| `0000` ADR-3, `0001` | Importer stores offsets as `captureOffsetTicks` | Importer emits `CaptureSession` + `timeMap` (ADR-3) |
| `0000` ADR-7, `0005` | Swift `mcp-bridge` subcommand | TypeScript `ovc-mcp` (ADR-6) |
| `0000` ADR-2, `0001` | Helper hosts `recover` and `mcp-bridge`; "single-helper rule" | Helper hosts native capture and `recover` only (ADR-2) |
| `0000` §2e, `0001` conditions | `G-SIGN` pass includes "notarized" | Split: `G-SIGN` = entitlements/hardened runtime/capture; notarization → `G-DIST` (ADR-7) |
| `0000` §2c, `0004` | ffmpeg: 9 fractional digits, lossy ≤ 0.5 ns; Micros round-trip ≤ 354 ticks | Withdrawn / corrected to ≤ 353; use counts at stream rate where exactness matters (ADR-8) |
| `0000` ADR-4, `0002` | Export: "demux → decode → composite → encode → mux" without stage definitions; "R-PoC" 2 weeks; audio mux unspecified | Eleven explicit stages; `G2-RENDER` adds R13–R15, pinned Electron, ≤ 3 weeks [P] (ADR-4, ADR-5) |
| `0000` ADR-4 | Stage 1 ffmpeg parity "not throwaway", built first | Conditional on `G2-RENDER` outcome (ADR-4, ADR-12) |
| `0000` §9, `IMPLEMENTATION_PLAN` Rev 3 | P3 parallel with P1/P2; P1 ∥ P5a | Sequential gates; P3 behind both gates (ADR-12) |
| `0000` §2g, §4 | Full camera and scenario matrices | Tier 1 / Tier 2 (ADR-1, `IMPLEMENTATION_PLAN.md` §3) |
| `0006` | ffmpeg trims by seconds | Counts at stream rate where supported [H] (ADR-9) |
| `0008`, `0000` §2f | Budgets "calibrated after P0a" | Ratified by `G0-THRESHOLDS`, still proposed until measured (ADR-10) |

---

## ADR-1 — Native capture stack

- **Context.** Capture is Chromium `MediaRecorder` producing software VP9 WebM, up to 24 Mbps at native Retina [V `quality.ts:15-21`], with no per-track timestamps [V `RecorderController.tsx:517`, `timeline-utils.ts:112`] and an unverified system-audio loopback on macOS [V `desktop-permissions.ts:59-76`]. Chromium has no hardware VP9 encode on macOS (platform fact, not tested here).
- **Decision.** Native Swift capture: **ScreenCaptureKit** (one `SCStream` per display, system audio via `capturesAudio`), **AVFoundation** (independent `AVCaptureSession` per camera, `AVCaptureDevice` input per microphone), **VideoToolbox via `AVAssetWriter`** (HEVC default, H.264 fallback, hardware required), LPCM audio. Cursor/click metadata later via `CGEventTap`.
- **Alternatives.** (a) Keep Chromium capture and fix it (interim `avc1`, offsets): cheap, but software encode and no recovery remain. (b) `AVCaptureMultiCamSession`: not listed for macOS (listed for Mac Catalyst 14), unverified there. (c) Core Audio process tap for system audio: separate permission, silent zero-fill on missing TCC; deferred. (d) SCK microphone: macOS 15+ only, reported corruption; rejected. (e) `AVAudioEngine` per mic: one device per engine; only if live DSP is needed.
- **Trade-offs.** Hardware encode and per-track files and honest timestamps, at the cost of a native codebase, TCC/signing work and a `G1-CAPTURE` risk on encoder throughput.
- **Rationale.** The three audits' capture findings (H1, H2, H3, H11) are not fixable inside `MediaRecorder`.
- **Unresolved.** Concurrent `SCStream`s on M1 [H]; multi-camera candidate C1–C6; crash-safe container (fragmented `.mov` vs CMAF segments vs segmented files); HEVC vs H.264; whether SCK/AVCapture buffers convert cleanly to host time.
- **Fallbacks.** F1 H.264; F2 30 fps or 1x scale; F3 Chromium cameras alongside native screen/audio; F4 segmented files; F5 process tap. A partial kill keeps Chromium capture for the failing source only.
- **Revision 4 — gate scope (`G1-CAPTURE`).** Scenarios are tiered by what can invalidate the architecture. Tier 1 (required for GO): T2, T3, **T3E** (editor open), **T3X** (concurrent export), T5 (120 min at native resolution), T6 (+ 60-min drift run), T7 (helper kill, Main kill, both), T9, memory-pressure (T12), thermal, camera pair C1. Tier 2 (reported): T1, T4, T8, T10, T11, camera trio, C2–C6. Forced-termination tests cover **process death, not power loss**. All thresholds remain [P] until `G0-THRESHOLDS` and measurement on the target M1 8 GB.

## ADR-2 — Swift/Electron integration

- **Decision.** One standalone **capture** helper `ovc-capture`, supervised by Electron main, speaking **protocol v1** (newline-delimited JSON over stdio; schemas in `native/protocol/v1/*.schema.json` generate TS+Zod and Swift `Codable`; `hello`/`init` handshake with `sessionToken`; `seq` on events; typed errors with a `fatal` flag; `sessionDir` confinement; stdin-EOF/SIGTERM finalize; 2 s heartbeat). The helper also hosts the native `recover` subcommand. **Revision 4: it no longer hosts `mcp-bridge`.** The "single-helper rule" becomes the **native capture rule**: exactly one native capture executable; future native needs (render fallback, thumbnails) may become subcommands, never resident daemons; non-native responsibilities are never added to it to satisfy the rule (MCP is TypeScript, ADR-6).
- **Alternatives.**

| | Standalone helper | In-process addon | XPC service |
|---|---|---|---|
| Crash containment | Yes | No (kills the UI) | Yes |
| Electron ABI coupling | None | Rebuild per ABI | Returns (Node needs a native addon for XPC) |
| Frame transport | Not needed (files) | N/A | Not needed |
| TCC/signing | Unverified (G-SIGN/G-TCC) | Simplest (app identity) | Responsible-process semantics [H] |

- **Rationale.** IPC cost is irrelevant (frames never cross); crash isolation and debuggability dominate.
- **Compatibility strategy.** Additive changes within a major; unknown event fields ignored; major bump advertised in `hello`; contract tests run on both sides against shared fixtures; version mismatch falls back to the Chromium engine behind `capture.engine`.
- **Unresolved.** Helper in `Contents/MacOS` vs `Contents/Helpers` vs nested `.app`; per-file signing method (electron-builder option → `afterPack` codesign → sign-first); usage strings embedded via `-sectcreate __TEXT __info_plist`; arm64-only because universal builds conflict with a prebuilt Swift helper.
- **Revision 4 gate split.** `G-SIGN` = own entitlements, hardened runtime, capture works (ad-hoc/development signing suffices). Notarization and stapling move to `G-DIST`, which needs the prerequisites of ADR-7. `G-TCC` runs first on ad-hoc/development signing and is **repeated on the notarized build** [H: attribution may differ]; its matrix is reduced to cells that can change the layout decision (L1, L3 × Finder/dev-control × fresh/relaunch; L2, L4 only on failure).
- **Reopened if** `G-SIGN` or `G-TCC` fail on every rung of their ladders: in-process addon, then Chromium capture for the affected capabilities.

## ADR-3 — Synchronization strategy

- **Decision.** Capture on one **host clock** (SCK and AVCapture buffers *converted* with `CMSyncConvertTime`, not assumed equal). **One synchronization representation in schema v3:** `MediaSource.timeMap` (per file) plus a document-level `CaptureSession`; `captureOffsetTicks` and `driftPpm` do not exist anywhere (never implemented [V]). Normative definition in `DATA_MODEL.md` §6.3:
  - Axes: source `s` (post-edit-list presentation ticks), capture `c` (anchor-relative host ticks, continuous through pauses), timeline `t` (only through clips).
  - `c(s) = C_i + divRound((s − S_i)·(10^6 + r_i), 10^6) + K`; `rateppm` `r = (Δc/Δs − 1)·10^6`, positive = source clock slow vs host; `durationTicks` is measured on the **source** axis; drift/segment term **first**, calibration `K` (source-wide) **last**; validator requires `r = 0` until `G1-CAPTURE` measures drift.
  - Discontinuities: gaps on either axis mean no data; overlap > 1 tick is invalid (`TIMEMAP_OVERLAP`); rollover to a new file = a new `MediaSource` (`segmentIndex`).
  - **Pauses:** authoritative owner is the capture manifest (`HostNs`); imported once into `CaptureSession.pauses` on axis `c`; no copy in `TimeMap`.
  - **Legacy:** v2 documents and imported files get the identity `TimeMap`; the Chromium engine writes the same manifest (`engine: "chromium"`, differences only) so every importer feeds one structure.
- **Alternatives.** (a) One `startedAt` + zero offset (today). (b) A fixed per-track offset only (`captureOffsetTicks`, Revision 3's interim field): fails on drift, pauses and rollovers, and would compete with `timeMap` as a second source of truth. (c) Retiming/dropping buffers on pause: risks clicks and non-increasing-timestamp writer errors [H]. (d) Audio-correlation alignment as the primary method: expensive and brittle; kept only as an optional cross-check.
- **Trade-offs.** A richer data structure for a cheap, uniform editor placement rule; calibration needs a user-assisted clap/flash.
- **Rationale.** USB webcam/mic timestamps hide latency (tens of ms [H]), audio clocks drift [H], screen tracks are VFR [V]. One mechanism covers every case.
- **Unresolved.** Whether `mach_absolute_time` pausing across sleep matters in practice (`mach_continuous_time` does not pause) [H, verify]; drift magnitude over 60 min; whether resampling at write time is needed or `rateppm` suffices; whether integer ppm (3.6 ms/h) is fine enough; pause method A vs B.
- **Budget [P].** Start offset <= ±1 frame (33 ms); drift <= 20 ms over 60 min after correction; no cumulative offset after 10 pauses.

## ADR-4 — Preview/export compositor

- **Decision.** One pure **scene evaluator** (`src/shared/render/`) and one **WebGL2 compositor** for both preview and export, with WebCodecs as codec primitives only (decode/encode) and an explicit pipeline around it (ADR-5). Delivered in two stages: (1) the incremental shared-geometry stage (CSS preview + ffmpeg export for static layouts), **conditional on the `G2-RENDER` outcome** (built only on PARTIAL/NO-GO, or earlier by owner decision); (2) the compositor, gated by `G2-RENDER`. The Electron version intended for the product is **pinned in P0b-min** and `G2-RENDER` runs inside it (R15), never only in a standalone browser; R1/R6/R7 are re-run on any later Electron major or minor bump.
- **Pinned Electron (P0b-min, 2026-11-15).** **43.8.10** (Chromium per `process.versions` of that build), exact version in `package.json` and `package-lock.json`, up from 43.0.0. Chosen as the latest 43.x patch (>= the 43.8.1 floor) to avoid a major bump during identity work. Verified after the bump: typecheck, 393/393 tests, build, MCP smoke and an unpackaged startup. `G2-RENDER` runs on this version.
- **Alternatives.** Keep extending the ffmpeg filtergraph (two implementations; already diverging [V]); AVFoundation + Metal/CoreImage native export (two backends, text divergence; kept as the **fallback**, run inside the helper from the same serialized `RenderScene`); native compositor for both with frames shipped into Electron (awkward transport); WebGPU (less mature, no headless software fallback for CI; revisited only if `G2-RENDER` shows an upload bottleneck [H]); full rewrite (not justified, the editor/domain are solid assets).
- **Trade-offs.** One shader set and one text rasterizer guarantees parity at the price of a WebCodecs player and a demuxer that must handle VFR/edit lists; `<video>` is not frame-accurate.
- **Rationale.** The only way to guarantee export matches preview is to remove the second implementation. The incremental stage fixes the headline gap early and makes the rollback honest.
- **Unresolved.** Preview player (WebCodecs vs `<video>` + shared shaders); 60 fps claim; working color space (SDR BT.709/sRGB, HDR refused or tone-mapped); text raster parity across Canvas2D versions; the Stage-1 owner decision (`IMPLEMENTATION_PLAN.md` §8).
- **Kill criteria.** Non-deterministic seek/step; hardware encode not proven; 1080p30 below 1.0x realtime; unbounded memory; demuxer failure with no fix in 3 working days; **new (R13/R14):** no candidate mux path produces a finalized MP4/MOV that opens in QuickTime/AVFoundation with A/V offset ≤ 1 frame. The native Metal/AVFoundation compositor remains a possible fallback, not an automatic second implementation.

## ADR-5 — Media pipeline: encoding, decoding, demux, mux

- **Decision.** Capture encodes with VideoToolbox (HEVC default, H.264 fallback) through `AVAssetWriter` with hardware required; LPCM audio. **WebCodecs provides codec primitives only; it is not a pipeline.** The render pipeline has eleven explicit stages (`ARCHITECTURE.md` §4.3): packet index (ffprobe, edit lists applied) → demux → `VideoDecoder` (hardware gated by measured evidence, not `isConfigSupported` alone) → frame-index-driven scheduling with hold semantics → WebGL2 compositing → hardware `VideoEncoder` (bitrate scaled by resolution/fps, explicit `bt709` tags) → audio mix by ffmpeg from `AudioMixPlan` → mux → final MP4/MOV container by ffmpeg stream copy (`+faststart`, `hvc1`, `colr`, `.part` rename) → VFR→CFR by hold, audio priming handled → hardware verification (R6). Proxies are 720p H.264. ffmpeg's role: probe, packet index, remux, proxies, audio peaks, audio mix, final mux.
- **Candidates `G2-RENDER` must decide [H, unverified]:** demux **D1** index-driven byte-range reads (preferred), **D2** a JS container demuxer (mp4box.js- or mediabunny-class; licenses and edit-list/VFR behavior not verified, no network used), **D3 rejected** (ffmpeg raw-frame pipe: no hardware path; 8,294,400 B per 1080p RGBA frame = 248.8 MB/s at 30 fps [S]); mux **M1** elementary-stream pipe to ffmpeg `-c:v copy` (try first, no new dependency), **M2** JS-muxed video-only intermediate + ffmpeg final stream copy, **M3** native `AVAssetWriter` passthrough (rejected unless M1 and M2 fail: adds Swift responsibility).
- **Alternatives.** ffmpeg `h264_videotoolbox`/`hevc_videotoolbox` for export (works today, but software filtering and fixed 8M [V]); ProRes proxies (disk-heavy); software x264/x265 (CPU-bound on 8 GB, GPL/patent questions).
- **Trade-offs.** Hardware paths cut CPU and heat but have concurrency limits (`-12908`) and require explicit fallbacks; owning demux/mux decisions costs a gate item (R13/R14) instead of an assumption.
- **Unresolved.** Chromium WebCodecs HEVC encode availability in the pinned Electron (gate on `isConfigSupported` **plus** R6); whether the macOS encoder emits B-frames and which bitstream format; AAC priming/edit-list handling; decoder-count ceiling on 8 GB (proposed 4); zoom export (crop-then-scale) if ffmpeg retains any role.

## ADR-6 — AI and MCP integration

- **Decision (Revision 4).** All reads and mutations go through the running app. **Responsibility split:** Swift = native capture, encoding, native recovery; Electron main = process supervision, security, IPC, document persistence; **TypeScript = MCP, AI gateway, domain operations, proposal validation**; renderer = UI, timeline, preview. `src/shared/editor-domain` is the only code that validates/applies/previews/commits/undoes operations; a main-process `DocumentService` is the only writer of `editor.json`; the renderer keeps an optimistic replica. MCP clients launch a small **TypeScript `ovc-mcp` executable** (MCP SDK, Zod schemas, compile-to-operations, pre-validation with the shared package) that talks to the AI gateway in Main over a Unix socket in `userData` (0600, per-launch token file, same-uid peer check [H, verify], versioned `hello`, `seq`; socket path ≤ 104 bytes [H, verify]). Main re-validates authoritatively with the same code. Tools are typed and compiled to domain operations through proposals: `create_proposal` → `add_operations` → `preview_proposal` → `commit_proposal`. Destructive operations and `start_export` always need in-app approval.
- **Alternatives (brief).** **A** Swift `mcp-bridge` (Revision 3): non-native responsibility in the capture helper, MCP coupled to the capture gates, schemas on the wrong side of a byte relay — superseded, kept as the `G-MCP` fallback. **C** Main hosts MCP (local Streamable HTTP/socket) + stdio shim: wider auth surface, shim still needed — not adopted. **D** `ELECTRON_RUN_AS_NODE=1` against the app binary (today [V `ai-connection.ts:84,89`]) or Electron `--mcp`: needs fuse `runAsNode:true` / boots Chromium per client — rejected as end state. Also rejected: offline *mutation* (breaks the single writer and approvals); offline *read-only* is technically possible with the shared parser but **not adopted** (stale snapshot beside the live authority; lock/CAS-read semantics) — revisit after `G-MCP`; keep writing `editor.json` directly with CAS (today); expose raw paths/shell/fetch (never).
- **Trade-offs.** The app must be running (or opt-in background launch); one more nested executable to sign and notarize; in exchange: one language in the AI path, one validation code path, one undo, one approval point, and fuse `runAsNode:false` becomes possible once `ovc-mcp` replaces the `ELECTRON_RUN_AS_NODE` launch.
- **Rationale.** Today the UI does not use the domain ops [V `editor-document-store.ts:103` is the only caller], MCP and Gemini write `editor.json` directly [V], Gemini skips scope checks [V], and `runAsNode:true` lets any local process borrow the app's grants [V].
- **Unresolved.** Packaging of `ovc-mcp` (Node single-executable vs bundled Node: size, signing, start time, launch from `claude mcp add` stdio; gate `G-MCP` [H]); `DocumentService` commit latency (P3.9; fallback: renderer keeps authority, main hosts a read replica); clean macOS background launch (focus, single-instance lock, start time); per-project upload consent and DELETE for Gemini. Starts only after both capability gates (ADR-12).
- **Security boundaries.** No shell, no raw filesystem paths, no network fetch through MCP; media import only via a main-side consent grant; typed errors (`APPROVAL_REQUIRED`, `OUT_OF_SCOPE`, `REVISION_CONFLICT`, `APP_NOT_RUNNING`).

## ADR-7 — Distribution, fork identity and licensing

- **Decision.** Initial distribution target is a **Developer-ID-signed, notarized, stapled, arm64-only DMG**, **subject to prerequisites that are not assumed to exist**: a paid Apple Developer Program membership (D1), a Developer ID Application certificate (D2), notarization credentials (D3), the fork's own Team ID (D4), helper and `ovc-mcp` signed with their own entitlements under the hardened runtime (D5), CI secret handling (D6) (`IMPLEMENTATION_PLAN.md` §7). **Technical feasibility is separated from distribution readiness:** `G-SIGN`/`G-TCC` run on ad-hoc or development signing; notarization, stapling, `spctl` acceptance and the final `G-TCC` re-confirmation belong to `G-DIST`. Before any packaged build (P0b-min): retarget `appId`, `productName`, `publish` and the Team ID (`package.json`, `scripts/verify-mac-release.mjs`, `release.yml`; the Team ID currently there is upstream's [V]) and disable auto-download until the fork's feed exists [V: `auto-updates.ts` checks upstream 5 s after launch and every 4 h when packaged]. Pin the Electron version in P0b-min; zod, MCP SDK, `npm audit`, SHA-pinned actions and scoped permissions are non-blocking hygiene. Stop maintaining MAS/bookmark code but do not delete it until a decision.
- **Alternatives.** Mac App Store first (needs sandbox, no GPL ffmpeg, no `disable-library-validation`: not viable now); universal build (conflicts with the helper); keep upstream's update channel (rejected: wrong update source, identity collision).
- **FFmpeg.** The bundled build is GPLv3 with x264/x265 [V `README.md:255-259`]. For the DMG, ship with the fork's own source offer. For any Store path, evaluate an LGPL build (VideoToolbox only) or native encode. **Questions for specialist counsel, not legal conclusions:** GPLv3 aggregation vs combined work and the form of the source offer; H.264/HEVC patent exposure (x264/x265 vs VideoToolbox); Whisper weights license and redistribution; overlay font licenses in exports; consent for uploading recordings to Gemini/cloud STT; fork name and trademark.
- **Security findings treated as reported, not verified at runtime.** 39 advisories from `npm audit --package-lock-only` (3 critical, 28 high, 8 moderate; critical entries are dev tooling), including Electron 43.0.0, `zod < 4.6.6`, `@modelcontextprotocol/sdk <= 1.31.0`.
- **Update (P0b-min, 2026-11-15).** The app is for the owner's own use for now and there is **no Apple Developer membership (D1–D4 absent)**: signing stays ad-hoc/development, no notarization. Implemented: `appId` `dev.micio86dev.openvideocraft`; `productName` unchanged ("Open Video Craft"; trademark question still open); `publish` and `repository` point to `micio86dev/openvideocraft`; upstream's Team ID removed (`verify-mac-release.mjs` now requires `OVC_MAC_TEAM_ID`, `release.yml` reads the `APPLE_TEAM_ID` secret); `autoDownload` and `autoInstallOnAppQuit` off; macOS targets arm64 only with `minimumSystemVersion` 26.5.2 (the only tested macOS: an assumption to lower once older versions are tested); `VITE_DEV_SERVER_URL` ignored when packaged. `dist:mac:universal` and the x64 FFmpeg preparation are untouched and now inconsistent with the arm64-only target.
- **Unresolved.** Fork name; legal review outcome; whether a Store build is ever wanted; whether D1–D4 will ever be obtained.

## ADR-8 — Time model

- **Decision.** Integer flick `Ticks` (1 tick = 1/705,600,000 s) stored in the domain; `HostNs` only in the capture layer; `Micros` only at the WebCodecs boundary; `Sec` only for display, legacy v2, MCP and ffmpeg argv; nine named conversion boundaries; a suffix lint on schemas. **Revision 4 hardening (`DATA_MODEL.md` §2):**
  - **Exact conversions:** `ticks = divRound(ns·441, 625)`, `micros = divRound(ticks·5, 3528)`, all with `bigint`; one rounding function `divRound` (round half toward +∞, floor division); one rounding per derived quantity, from absolute values.
  - **Overflow:** any product with a non-tick factor uses `bigint`; return to `Number` only through `checkedTicks` (`|b| ≤ 2^53−1`); a sound fast path (`|a·b| < 2^53` ⇒ exact) for hot loops. A 10 h clip exceeds 2^53 when the speed denominator is above ~354 [S].
  - **Registries:** composition fps and source audio sample rates are accepted only if their period divides 705,600,000 (384 kHz is not).
  - **Honest exactness:** Micros round-trip error ≤ **353** ticks; the µs labels at the WebCodecs boundary never become the muxer timebase; MCP seconds are a 1 µs grid that is **not** the frame grid at 30000/1001, so video operations snap to frames by default and `…Frame` addressing exists; the ffmpeg "9 digits, ≤ 0.5 ns" claim is withdrawn (ffmpeg parses most time options to µs [H]), and sample/frame counts replace seconds where exactness matters [H].
- **Alternatives.** Float seconds (today; drift in ripple math); integer microseconds (does not divide 24000/1001 and 44.1 kHz exactly); rational per-source time everywhere (heavier to reason about).
- **Rationale.** 705,600,000 divides every registry frame duration and sample period exactly (arithmetic); JS safe-integer horizon is ~147.7 days.
- **Unresolved.** Verified by the P3.1 property tests (a–g); ffmpeg time-option resolution and per-filter count support in the pinned build (P0a probe, P7).

## ADR-9 — Audio pipeline

- **Decision.** One `AudioMixPlan` derived from the document. Preview interprets it with WebAudio; export compiles it to a streaming ffmpeg graph (`atrim/adelay/volume/acrossfade/amix normalize=0/alimiter`, optional two-pass `loudnorm`) **using sample counts at the stream's rate rather than seconds where ffmpeg supports them** (`atrim start_sample/end_sample`, `adelay` in samples [H, verify per filter in P7]); transcription and analysis use the same plan via ffmpeg PCM. Edit points snap to samples only at render; retimed audio rounds once at the clip end; AAC encoder priming is handled in the mux step (R13). Transition audio is the registry entry's declared companion (ADR-13).
- **Alternatives.** Keep three implementations [V: WebAudio preview, renderer decode, ffmpeg `amix`]; do all mixing in WebAudio offline (memory-heavy on long timelines).
- **Rationale.** Export currently has no limiter and volumes up to 4× [V `ffmpeg.ts:274,408,958`], so it can clip where the preview looks fine; transition audio is a plain `afade`.
- **Unresolved.** Loudness target defaults; per-track gate/compressor/EQ scope; numeric tolerances [P: ±0.5 dB RMS/peak, ±1 LU].

## ADR-10 — Measured baselines and memory budgets

- **Decision.** Budgets use **physical footprint** (`footprint`) per process, whole-app sums with shared IOSurface reported once, and system gates (`memory_pressure`, swap). **RSS is diagnostic only and never a pass metric.** All numbers are proposals until the P0a original baseline (untouched `143a0d6`, isolated worktree, external tooling, unpackaged or network-blocked) exists and is frozen; P0c re-measures after P0b-min. **Revision 4 adds `G0-THRESHOLDS`:** after P0a/P0c the owner ratifies or revises every [P] number (budgets and the `G1-CAPTURE`/`G2-RENDER` criteria) in writing **before** a gate runs, so gate results are never judged against unexamined proposals; after ratification the numbers are still **proposed until measured on the target M1 8 GB machine**. New budget lines: recording under editor load (T3E), under concurrent export (T3X, `J1`), finalized-export A/V sync (R13).
- **Alternatives.** RSS-only (double-counts shared pages, excludes compressed memory); synthetic micro-benchmarks (320x180 clips: not representative).
- **Unresolved.** Every numeric budget; the in-repo harness must cross-validate against the external one within 5% [P] before gating regressions.

## ADR-11 — Editor domain v3

- **Decision.** Domain operations become the only mutation path, delivered in twelve reversible slices (P3.0–P3.11), each behind its own flag with a differential test, and v3 entities (`MediaSource`, `CaptureSession`, `Track`, `Clip`, `Transition`, `Effect`, `Composition`, templates, `Transaction`) replace the flat v2 structure. Document-level transactional history replaces segment-only undo (50 entries today [V: `slice(-49)` plus the new entry, `useTimelineEditing.ts:272`]). Immer patches adopted or rejected after a measured size check. **Revision 4 sequencing:** no slice starts before `G1-CAPTURE` and `G2-RENDER` have reported; each slice then starts only when P4, P5b or P9 names it as a dependency (ADR-12).
- **Alternatives.** Big-bang UI migration (high risk on a ~22k-line renderer); keep the flat v2 model (no tracks, no `sourceEnd`, no keyframes, no TimeMap); a parallel track from day one (Revision 3; rejected: infrastructure ahead of its justification).
- **Unresolved.** Immer vs hand-written inverses; `DocumentService` authority (ADR-6).

## ADR-12 — Gate-driven roadmap (new in Revision 4)

- **Context.** Two capabilities decide whether the product works: reliable multi-source recording with synchronization and recovery, and deterministic preview/export rendering with audio. Revision 3 ran P1, the render spike and the first domain slices in parallel on one Mac whose media engine and 8 GB they would contend for, and built the v3 migration and Stage-1 ffmpeg parity before the gates that justify them.
- **Decision.** Order: P0a → P0b-min (fork identity, update isolation, pinned Electron) → P0c → `G0-THRESHOLDS` → `G-SIGN`/`G-TCC` (feasibility, ad-hoc/dev signing) → `G1-CAPTURE` → `G2-RENDER` → (P2/P4 on `G1` GO/PARTIAL, P5b on `G2` GO/PARTIAL) → `J1` → domain slices as dependencies demand → P6–P11. Measurement runs of the two gates never overlap. Each gate has GO / PARTIAL / NO-GO with a stated consequence (`IMPLEMENTATION_PLAN.md` §2.1). Domain v3, advanced AI/MCP, templates and secondary features move behind both gates unless a named dependency requires earlier work (P3.1 for P4/P5b). The roadmap promises no capability whose gate has not passed.
- **Alternatives.** Keep Revision 3's parallel tracks (hardware contention invalidates measurements; effort lands before evidence); render-first ordering (cheaper, but capture is the higher architectural risk); single combined PoC (couples two independent failure modes).
- **Trade-offs.** Slower visible feature progress in exchange for earlier, cheaper discovery of a fatal flaw; a longer serial hardware queue on one machine.
- **Unresolved.** Owner decisions in `IMPLEMENTATION_PLAN.md` §8 (Apple Developer account, minimum macOS, storage, Stage-1 priority, threshold ratification).

## ADR-13 — Clip timing and typed transition registry (new in Revision 4)

- **Context.** v3 `Clip.speed` was a bare rational and `Transition.type` ended in `| string`; v2 speed is `1|2|3|4|5` [V `types.ts:31`] and transitions are four literals centered on the cut [V `transition-utils.ts:81-82`].
- **Decision (`DATA_MODEL.md` §4.2a–b).** `speed = num/den`, integers ≥ 1, gcd-normalized, `[1/4, 8]` [P]; zero and negative rejected. Timeline duration `divRound((out − in)·den, num)` derived once, never stored; source bounds on the file axis independent of speed; same-track clips half-open and non-overlapping, gaps allowed; video-track boundaries snap to the frame grid by default (`snap: "frame"`), sub-frame legal for audio and keyframes, visibility at frame `n` iff `start ≤ n·ticksPerFrame < end`. Transitions and effects share one typed, versioned registry (`{id, version}`, schema, shader id, audio companion); unknown refs are a validation error on write and preserved-and-flagged on read; v2 literals map 1:1. Transition semantics are **centered on the cut with unchanged timeline duration and held edge frames**, which preserves v2 and makes migration lossless; duration limits default to v2's `[0.1 s, 2 s]` [V].
- **Alternatives.** Overlap-defined (NLE-style) transitions that shorten the timeline (changes v2 behavior and ripple math); free-form transition strings (no validation, unportable between preview, export and MCP); speed 0 as freeze (breaks division and the inverse map); sub-frame snapping always on (breaks audio-level edits).
- **Trade-offs.** Lossless migration and typed safety versus no real-handle transitions in v3.0 (a later registry version).
- **Unresolved.** Speed range and duration bounds are [P] pending audio-retime quality (P7).

## ADR-14 — P0b hygiene: macOS-only CI, immutable action pins and coverage tooling

- **Context.** P0b-hygiene is non-blocking after P0c. The fork targets an arm64-only macOS DMG, has no Apple Developer account for public distribution, and inherited mutable GitHub Action tags, a Windows CI/release matrix, broad workflow permissions and no runtime audit gate.
- **Decision (2026-11-19).** CI and release build only macOS; Windows scripts, tests, packaging configuration and release jobs are retired. Every external `uses:` reference is pinned to a full 40-character commit SHA with an inline version comment, and Dependabot reviews weekly npm and GitHub Actions updates. Top-level workflow permissions are `contents: read`; only the release-publishing job receives `contents: write`. CI runs `npm audit --omit=dev --audit-level=high`; full dev-tooling advisories are reported separately. `@vitest/coverage-v8` is **deferred**: no coverage thresholds exist yet, so adding the dependency before a coverage gate would be unused infrastructure. Historical Windows legal/audit documents remain in the repository but are no longer packaged or referenced by release workflows.
- **Alternatives.** Keep mutable major tags (simpler updates but allows unreviewed action code); retain a Windows matrix (unsupported target and extra supply-chain surface); add coverage tooling immediately (dependency without an acceptance threshold); grant `contents: write` to every job (violates least privilege).
- **Trade-offs.** SHA pins require reviewed Dependabot bumps; macOS-only CI cannot validate Windows regressions, which is intentional for this fork. Remote CI remains unverified locally until a push or workflow run is authorized.
- **Status.** Implemented locally; static workflow tests and local equivalents of CI checks pass. `G0-THRESHOLDS`, Apple Developer credentials and public distribution remain owner decisions.

## ADR-15 — Owner decisions after P0c and P0b-hygiene (2026-11-19)

- **Context.** P0c and P0b-hygiene are complete locally. The roadmap still gates native capture, render parity and public distribution on owner decisions and measured hardware evidence.
- **Decision.** The owner ratified every `[P]` performance and quality threshold in `IMPLEMENTATION_PLAN.md` §4 and §3 as the reference for `G0-THRESHOLDS`; they remain proposals until measured on the target machine. The owner confirmed there is **no Apple Developer Program membership or Developer ID/notarization credentials**: distribution stays local/ad-hoc and `G-DIST` is deferred. The owner authorized pushing `feat/p0b-min-fork-identity` to the fork remote, with no merge or pull request implied. The owner asked to resume the blocked native RDD review with a valid host-issued binding; the provider continued to report `binding-mismatch` and forbade automatic retry, so no approval was burned.
- **Scope correction (owner override, 2026-11-19).** Native review R3-001 classified the arm64-only release target as a candidate-caused BLOCKER. The owner chose to restore Intel x64 and universal macOS targets: `package.json` again exposes `dist:mac:universal`, `mac.target` builds x64+arm64 DMG/ZIP, and `release.yml` passes `--x64 --arm64`. The arm64-only statements in ADR-7 and ADR-14 are superseded for release-target scope only; ad-hoc signing and `G-DIST` deferral remain unchanged.
- **Alternatives.** Withhold threshold ratification (would block gate runs); obtain paid Apple credentials (changes `G-DIST` scope); keep the branch local (no remote publication); disable RDD (not requested).
- **Trade-offs.** Gate criteria are now owned but still unmeasured; public distribution remains impossible; remote CI is publishable but native review authority remains unresolved.
- **Status.** Accepted owner decisions; hardware gates and notarized distribution remain open.
