# ARCHITECTURE — Open Video Craft macOS fork (Revision 4)

- **Baseline:** `main` @ `143a0d6` (v1.0.6, unreleased; latest stable upstream `v1.0.5`).
- **Target:** macOS-first, Apple Silicon only, primary machine MacBook Pro M1 with **8 GB RAM**. Signed and notarized DMG first, **subject to the distribution prerequisites in `IMPLEMENTATION_PLAN.md` §7, which are not assumed to be in place**.
- **Status:** planning only. Nothing was installed, built, tested or benchmarked to write this. The pass/fail state of the existing ~367 tests is **unknown**. Every decision below is **Proposed**; none is Accepted (`ADR.md`).
- **Relationship to other documents:** this file supersedes `docs/adr/0000-architecture-roadmap.md` (Revision 2) and the per-ADR files `0001…0008` where they differ (lists in section 11 and the supersession table in `ADR.md`). Long-form detail, test matrices and thresholds stay in `docs/adr/0000` unless Revision 4 states otherwise. Companion files: `DATA_MODEL.md`, `IMPLEMENTATION_PLAN.md`, `ADR.md`.
- **Gate names (one name everywhere; criteria live only in `IMPLEMENTATION_PLAN.md` §2.1):** `G0-THRESHOLDS`, `G1-CAPTURE` (formerly "P1 PoC"), `G2-RENDER` (formerly "R-PoC" / "P5a"), `G-SIGN`, `G-TCC`, `G-MCP`, `G-DIST`, joint check `J1`.

**Evidence tags:** **[V]** verified by reading code (path cited) · **[S]** static estimate or arithmetic · **[H]** hypothesis that a proof of concept must confirm · **[P]** proposed target, to be calibrated against a measured baseline. No benchmark result exists; none is invented here.

---

## 1. Verdict in one page

1. **Keep** the Electron editor, the editor domain (`src/shared/editor-domain/*`), project containment, atomic writes, chunked disk streaming, `runProcess`/`ExportJobRegistry`.
2. **Replace the capture back-end** (Chromium `MediaRecorder`, software VP9, no per-track timestamps) with **one standalone Swift capture helper** (`ovc-capture`) using ScreenCaptureKit, AVFoundation and VideoToolbox. Gated by `G1-CAPTURE` on the real M1.
3. **Replace the render back-end** (React/CSS preview + hand-built ffmpeg filtergraph that drops camera, layout, background, corners) with **one shared scene evaluator** and **one WebGL2 compositor** used by preview and export. WebCodecs supplies codec primitives only; demux, scheduling, mux and container generation are explicit pipeline stages (section 4.3), with ffmpeg as probe/audio/final-mux toolbox. Gated by `G2-RENDER`, which proves the whole pipeline to a playable finalized file inside the pinned Electron.
4. **Make the domain the only mutation path.** Today the UI does not use it [V: `applyEditorOperations` is called only from `src/main/editor-document-store.ts:103`, i.e. the MCP/Gemini path]. So "AI and GUI share one model" is a refactor target, not a current fact.
5. **Two capabilities decide the project; everything else waits behind them.** (a) Reliable multi-source recording with synchronization and recovery (`G1-CAPTURE`, with `G-SIGN`/`G-TCC`). (b) Deterministic preview/export rendering with audio (`G2-RENDER`). The v3 domain migration, advanced AI, templates and secondary features start only after both gates, unless a named dependency requires earlier work (`IMPLEMENTATION_PLAN.md` §2.2). Each gate has GO / PARTIAL / NO-GO outcomes and a fallback that keeps the product shippable.
6. **Technical feasibility is not distribution readiness.** Local signing and capture experiments can run with ad-hoc or development signing; a notarized Developer ID build needs an Apple Developer account and certificates the owner may not have (`G-DIST`, `IMPLEMENTATION_PLAN.md` §7).

The audits are right that preview and export diverge (C1). They are **not** right to imply one fix: the fix has two independent halves (capture, render) and they can fail independently.

---

## 2. Components and responsibilities

```
┌───────────────────────── Electron app (arm64, hardened) ───────────────────────────┐
│ Renderer: Editor UI (React) ─ dispatch ops ─► Domain store (editor-domain v3)       │
│   ├─ Preview: scene evaluator ─► WebGL2 compositor ◄─ <video> / VideoFrame sources  │
│   └─ Recorder UI (levels, thumbnails, device state; no frames over IPC)             │
│ Hidden export renderer: scene evaluator ─► compositor ─► WebCodecs encode ─►        │
│   elementary video stream ─► Main ─► ffmpeg (audio mix + final mux) ─► MP4/MOV      │
│ Main process                                                                         │
│   IPC gateway (schema + sender allowlist) · ProjectStore · ProcessSupervisor         │
│   DocumentService (sole writer of editor.json) · Recovery service                    │
│   CaptureEngine { native | chromium } ── stdio JSONL v1 ──► ovc-capture (Swift)      │
│   Media toolbox (ffmpeg: probe + index, remux, proxies, peaks, audio mix, final mux) │
│   AI gateway (TypeScript: Unix socket + token, proposals, approvals)                 │
│        ◄── socket ── ovc-mcp (TypeScript executable, spawned by MCP clients)         │
│        ◄── in-process ── Gemini agent                                                │
└──────────────────────────────────────────────────────────────────────────────────────┘
ovc-capture (Swift): SCStream per display (+ SCK system audio) · AVCaptureSession per camera and mic
             · host-clock stamping · AVAssetWriter (VideoToolbox HEVC/H.264) · LPCM audio
             · capture-session.json manifest · `recover` subcommand · writes only inside its sessionDir
ovc-mcp (TypeScript): MCP stdio server (MCP SDK) · tool schemas (Zod, shared with the domain) ·
             compiles tool calls to domain operations and pre-validates proposals with the shared
             editor-domain package · talks to the app only through the authenticated socket · never reads or writes editor.json
```

| Component | Language | Owns | Must never |
|---|---|---|---|
| `ovc-capture` | Swift | Native capture, hardware encode-to-file, manifest, device/permission state, native `recover` | Send frames over IPC; write outside `sessionDir`; delete files; touch the network; host MCP or any non-native responsibility |
| Electron main | TypeScript | Process supervision, security, IPC validation, document persistence (`DocumentService`), recovery orchestration, AI gateway (socket server, proposal store, approvals) | Decode or composite video |
| `ovc-mcp` | TypeScript | MCP protocol, tool schemas, compilation to domain operations, proposal pre-validation | Hold document authority; persist anything; expose shell, raw paths or network fetch |
| Renderer | TypeScript | UI, timeline, optimistic document replica, preview compositor | Persist the document directly; decode whole media files into RAM |
| Export renderer | TypeScript | Frame-exact compositing and WebCodecs encode | Share memory budget with editor UI (separate process) |
| ffmpeg | C (external) | Probe, packet index, remux, proxies, audio peaks, audio mix, final mux | Own visual semantics (retired after parity GA) |

**Native capture rule (replaces Revision 3's "single-helper rule").** Exactly one native **capture** executable. A future native render fallback or native thumbnails may become subcommands of it, never new resident daemons. Responsibilities that are not native are **not** added to it to satisfy this rule: MCP lives in TypeScript (section 7), where the MCP SDK, the Zod schemas and the domain package already are.

---

## 3. Native macOS capture (question A)

### 3.1 API assessment

| Need | API | Assessment |
|---|---|---|
| Each display | **ScreenCaptureKit** `SCStream`, one per display | Native pixel size, IOSurface-backed buffers, hardware path to VideoToolbox. **Concurrent streams are undocumented [H]**; forum reports of all streams stopping exist. `G1-CAPTURE` test T2 is a real go/no-go. |
| System audio | SCK `capturesAudio` (macOS 13+) on one designated stream | Primary path. Tied to that stream's lifetime: if its display is unplugged, audio stops, so audio ownership must fail over. Core Audio process taps are a later alternative (need `NSAudioCaptureUsageDescription`, fail silently with zero-filled buffers when TCC is missing). |
| Webcams | Independent `AVCaptureSession` per camera (leading candidate) | **`AVCaptureMultiCamSession` is not listed for macOS** (iOS 13, Mac Catalyst 14, tvOS 17, visionOS 2.1) [V from Apple docs, fetched during the Rev 2 review]. Six candidates C1–C6 are tested, not assumed. Limit is USB host-controller bandwidth, not the API. |
| Microphone(s) | `AVCaptureDevice` audio input per mic, chosen by explicit device ID | SCK microphone capture is macOS 15+ only, below the 14.2 floor, with reported corruption. `AVAudioEngine` binds one input device per engine, awkward for N mics; use only if live DSP is needed. |
| Encode | **VideoToolbox through `AVAssetWriter`**, HEVC default, H.264 fallback; audio LPCM | `RequireHardwareAcceleratedVideoEncoder` so a busy engine fails loudly instead of silently dropping to software. `-12908` "encoder busy" is reported on M1 [H]. Encoder throughput for 2 Retina displays + 2 cameras on one M1 media engine is the **#1 `G1-CAPTURE` risk**. |
| Cursor and clicks (later) | `CGEventTap` listen-only | Needs Input Monitoring permission; optional, P2. |

Hardware reality: a 13" M1 MacBook Pro drives one external display natively, so "multiple displays" in `G1-CAPTURE` means internal + one external (DisplayLink virtual displays behave differently). The working Mac has the internal 2560x1600, an external 3440x1440, and three real cameras. It runs macOS 26.5.2, so it **cannot** validate 14.2 or 15 behavior.

Screen tracks are **variable frame rate** (SCK delivers frames on change; drop buffers whose status is not `.complete`). Editor, importer and export must never assume constant fps.

### 3.2 Integration choice

| Criterion | **Standalone helper (proposed)** | In-process native addon (N-API/Swift) | XPC service |
|---|---|---|---|
| Crash containment | Helper dies, editor lives, partial files recoverable | Kills the app and the UI | Contained; launchd restarts |
| Electron upgrades | No ABI coupling | Rebuild per Electron ABI | Node cannot speak XPC without a native addon, so the ABI coupling returns |
| IPC cost | Control messages only (KB/s); media never crosses IPC | None | Same as helper, plus XPC glue |
| Debugging | Xcode/lldb, `swift test`, CLI-runnable | Mixed JS/native stacks | Harder |
| Signing/TCC | One nested Mach-O, own entitlements (**G-SIGN, G-TCC unverified**) | Same identity as the app (simplest TCC) | Responsible-process semantics [H] |

IPC overhead is irrelevant because frames never cross the boundary; the helper writes files and reports metadata. **Proposed decision:** standalone helper (status Proposed; `G1-CAPTURE`, `G-SIGN`, `G-TCC`). **Reopened only if** `G-SIGN` or `G-TCC` fail on every rung of their ladders; the in-process addon is then the fallback, XPC a G-TCC rung.

### 3.3 Protocol v1 (summary; full spec in `docs/adr/0000` ADR-2)

- Newline-delimited JSON over stdio; stderr is logs. Source of truth: JSON Schema in `native/protocol/v1/`, generating TS types + Zod validator and Swift `Codable`; shared fixtures run on both sides.
- Envelopes: request `{v, id, type, payload}`; response `{v, re, ok, payload|error}`; event `{v, event, seq, payload}` with monotonic `seq` (a gap means lost messages).
- Handshake: helper `hello{protocolVersions, helperVersion, os, capabilities}` → main `init{protocolVersion, sessionToken}`. Mismatch → typed error → app falls back to the Chromium engine behind flag `capture.engine`.
- Requests: `permissions.status|request`, `sources.list`, `session.prepare|start|pause|resume|stop|abort`, `ping`.
- Events: `state`, `track.started{trackId, firstPtsHostNs}`, `stats` (1 Hz), `level` (10 Hz), `thumb` (<=1 Hz, tiny JPEG written to `sessionDir`), `device.lost|restored`, `warning`, `error{code, fatal}`, `finalized{manifestPath}`.
- Lifecycle: warm-start when the recorder opens; **stdin EOF or SIGTERM/SIGHUP → finalize all writers, write manifest, exit 0**; ignore SIGPIPE; heartbeat `ping` every 2 s, 3 misses → SIGTERM, +5 s SIGKILL, then recovery. Helper death → session marked `interrupted` → recovery.
- Compatibility: additive changes within a major version; unknown event fields ignored; unknown request type → `INVALID_REQUEST`; major bump requires both sides to advertise it in `hello`.
- Error codes: `PERMISSION_DENIED, SOURCE_UNAVAILABLE, DEVICE_LOST, ENCODER_UNAVAILABLE, ENCODER_OVERLOADED, DISK_FULL, DISK_SLOW, INVALID_REQUEST, INVALID_STATE, INTERNAL`. Non-fatal errors keep the other tracks recording.
- Media ownership: main creates `sessionDir` inside the contained project folder and passes only that path; the helper refuses anything outside (realpath check) and never deletes; after `finalized` ownership passes to main.

### 3.4 Packaging, permissions (hypotheses, gated)

Not decided until experiments pass:
- **`G-SIGN`:** can the nested helper carry its own entitlements (`device.camera`, `device.audio-input`; no `allow-jit`, no `disable-library-validation`), run under the hardened runtime, and still capture camera and microphone? Methods tried in order: electron-builder per-file options → `afterPack`/`afterSign` `codesign` → sign helper first. Note [V]: `build/entitlements.mac.plist` currently has `allow-jit` and `disable-library-validation`, and the inherit plist has only camera/audio-input. **Revision 4 splits the question:** *feasibility* (entitlements, hardened runtime, capture works) can be tested with ad-hoc or development signing; *notarization acceptance and stapling* need a Developer ID certificate and an Apple Developer account and belong to `G-DIST` (`IMPLEMENTATION_PLAN.md` §7). Revision 3 required notarization inside the G-SIGN pass, which could not be met without an account the owner may not have.
- **`G-TCC`:** which layout (helper in `Contents/MacOS`, `Contents/Helpers`, nested `.app`) yields exactly one permission entry per capability under the **app** name, surviving relaunch and helper restart. Must also run on macOS 14.2 and 15 hardware; if 14.2 hardware is unobtainable, the supported minimum is raised to the lowest tested version. TCC attribution under ad-hoc or development signing may differ from a Developer ID build [H], so the final `G-TCC` confirmation is repeated on the notarized build inside `G-DIST`.
- Usage strings: `NSScreenCaptureDescription` in `package.json` `extendInfo` is not a documented Apple key [unverified], and there is no `NSAudioCaptureUsageDescription` [V].
- Stay **arm64-only** (a prebuilt Swift helper conflicts with `@electron/universal`). Set `mac.minimumSystemVersion` (currently unset [V]).

---

## 4. Preview and export parity (question B)

### 4.1 Options

| Option | Parity guarantee | 8 GB fit | Effort | Verdict |
|---|---|---|---|---|
| Extend the ffmpeg filtergraph | Two implementations; already diverging [V: export zoom sums strengths and uses polynomial easing, preview uses a cubic-bezier chain; 6 constants hand-copied] | Per-frame upscale zoom is heavy | L | Reject as the long-term visual engine |
| AVFoundation `AVVideoComposition` + Metal/CoreImage (native export) with CSS/WebGL preview | Two backends; text (Core Text vs Canvas) is the classic divergence | Good | XL | **Fallback**, inside the helper |
| Native compositor for both (frames shipped into Electron) | One backend | Frame transport into Chromium is awkward | XL+ | Reject |
| **WebGL2 compositor for preview and export + WebCodecs; ffmpeg for audio/mux** | **One backend, one shader set** | GPU-resident frames, bounded decoders | L–XL | **Proposed, gated by `G2-RENDER`** |
| WebGPU instead of WebGL2 | Same | Same | L–XL | Not now: WebGL2 is more mature and has a software fallback (SwiftShader) for headless CI goldens. Revisit only if `G2-RENDER` shows a texture-upload bottleneck [H]. |

### 4.2 Why not "just keep extending ffmpeg" — and why not a rewrite either

Incremental evolution is sufficient for **static** layouts and **insufficient** for the product. So the route is staged, and Revision 4 puts the stages behind the gate that justifies them:

1. **Stage 1 (incremental ffmpeg parity) — conditional, not built before `G2-RENDER` reports.** Extract a pure `evaluateScene(doc, tTicks) → RenderScene` into `src/shared/render/` (moving `layout-geometry.ts`, `zoom-utils.ts`, text metrics, playback sync) and drive the CSS preview **and** the ffmpeg export from it for static layouts (camera placement, background, corners, circle masks via pre-rasterized PNG mask + `alphamerge`/`overlay`). It is built if `G2-RENDER` is PARTIAL or NO-GO, or earlier only if the owner prioritizes camera-in-export before the compositor (owner decision, `IMPLEMENTATION_PLAN.md` §8). Rationale: if the compositor passes, Stage 1 is mostly throwaway except as a rollback; building it first is infrastructure before its justification. If Stage 1 is skipped, the rollback for the compositor is the previous release's export path, which drops the camera: that is stated, not hidden, and `export.engine=ffmpeg-legacy` is documented as feature-reduced.
2. **Stage 2 (gated by `G2-RENDER`):** WebGL2 compositor + WebCodecs pipeline (section 4.3). Needed because keyframed animation, shadows, styled text and per-frame zoom become ffmpeg expression strings whose parity holds only by convention.
3. **Fallback:** if a hard-kill criterion fires, the same serialized `RenderScene` JSON (plus renderer-produced text rasters, so text parity holds) is consumed by an AVFoundation/Metal compositor in the capture helper. It is a possible fallback, **not** an automatic second implementation: it is scoped and budgeted only after a NO-GO.

No rewrite of the editor, domain or UI is proposed; only the render back-end changes behind `export.engine`.

### 4.3 Design

- **Scene evaluator:** pure TS, no DOM. Output is an ordered layer list `{sourceRef, sourceTimeTicks, crop, transform(2D affine), opacity, cornerRadiusPx, border, shadow, mask, blend, effects[]}` plus text/card layers referencing a raster cache key. It holds all timing semantics (speed, transitions, zoom chains, keyframes).
- **Compositor:** WebGL2. Frame sources: `HTMLVideoElement` (interactive preview) or WebCodecs `VideoFrame` (export, frame-exact scrub). Same shaders for both.
- **Text, cards, subtitles:** rasterized once per content change via Canvas2D/OffscreenCanvas into textures; preview and export use the same raster code and the same bundled fonts. Styled subtitles (karaoke/boxed/pop) are rendered by the compositor, not SRT burn-in (fixes H9).
- **Export** runs in a dedicated hidden renderer or OffscreenCanvas worker with `backgroundThrottling:false`. **WebCodecs is not a video editing pipeline:** it provides `VideoDecoder`/`VideoEncoder`/`VideoFrame` primitives and nothing else: no demuxing, no muxing, no container, no timing model, no A/V sync, no file I/O. Each of those is an explicit stage in the table below, with an owner and a candidate set that `G2-RENDER` must decide. Audio comes from the audio mix plan (section 6, item 6).

| # | Stage | Owner | Mechanism (proposed) | Alternatives and risks [H unless stated] |
|---|---|---|---|---|
| 1 | Probe and packet index | Main + ffprobe | `ffprobe` packet table → `.ovc/index/<source>.json`: per packet presentation pts/dts (container **edit list applied**), keyframe flag, byte offset and size, plus codec configuration (avcC/hvcC) | Cost of packet listing on 2 h files unmeasured; edit-list and negative-start handling must be proven (R3) |
| 2 | Demux | Worker | **D1:** index-driven: read byte ranges, build `EncodedVideoChunk`s, timestamps taken from the index. **D2:** a JS container demuxer (mp4box.js- or mediabunny-class library; license, edit-list and VFR behavior **not verified**, no network access was used) | **D3 rejected:** ffmpeg decode to raw frames over a pipe: no hardware path and a 1080p RGBA frame is 8,294,400 B, i.e. 248.8 MB/s at 30 fps [S] |
| 3 | Decode | Worker | `VideoDecoder` configured from the index; seek = nearest preceding keyframe, decode forward, discard frames before the target; caps from section 5.3 | HEVC hardware decode availability in Electron 43; GOP length bounds seek latency (R1/R2) |
| 4 | Frame scheduling and timestamps | Worker | Pull-based, frame-index driven: output frame `n` → `t_n = n · ticksPerFrame` → `evaluateScene` → source time `s` per layer → latest source frame with pts ≤ `s` (hold). Decoded frames are matched to requests by **frame number from the index, not by µs timestamps**. Encoder back-pressure pauses decode | VFR sources, B-frame reorder, negative start times (R3); output is always CFR at `composition.fps` |
| 5 | Compositing | Worker, WebGL2 | Same shaders as preview; BT.709/sRGB working space | Texture upload cost (R7); color (R4) |
| 6 | Video encode | Worker | `VideoEncoder` H.264 (HEVC if proven), `hardwareAcceleration: "prefer-hardware"`, forced keyframe every N frames, `VideoFrame.timestamp` from boundary 3 (`DATA_MODEL.md` §2) | `prefer-hardware` may silently fall back to software: **R6 evidence chain required**. Whether the macOS encoder emits B-frames and which bitstream format (Annex-B vs AVCC + description) is used must be observed |
| 7 | Audio | Main + ffmpeg | `AudioMixPlan` → streaming ffmpeg graph → AAC-LC 48 kHz (or PCM intermediate); sample-count trims (`DATA_MODEL.md` §2, boundary 6) | AAC encoder priming (1024 samples on the native encoder) shifts audio unless an edit list or compensating trim is written (R13) |
| 8 | Mux | Main | **M1 (try first, no new dependency):** pipe the encoder's elementary stream to ffmpeg (`-framerate num/den -c:v copy`) together with the audio. **M2:** JS muxer (mp4-muxer-class) writing a video-only intermediate, then M1's stream-copy final mux. **M3 (rejected unless M1 and M2 fail):** native `AVAssetWriter` passthrough in the helper: it adds a Swift responsibility | CFR output means pts = frame index × `den` in timescale `num`; with no B-frames dts = pts; with B-frames ffmpeg's parser must reconstruct ordering |
| 9 | Final container | ffmpeg stream copy | MP4 by default (`-movflags +faststart`), MOV optional; `hvc1` tag for HEVC and explicit BT.709 `colr` tags; written to `.part`, renamed on success | QuickTime playability of the finalized file is a gate item (R14) |
| 10 | VFR and edit lists | Stages 1, 4 | Input: index applies edit lists; VFR → CFR by hold. Output: CFR, no edit list except audio priming | Edit-list semantics differ across muxers; tested on real helper output (R3) |
| 11 | Hardware verification | `G2-RENDER` | R6: `isConfigSupported` + CPU/power delta + OS-level confirmation. At runtime the app logs the config probe and measured throughput and treats an unproven or slow encoder as a warning with a software fallback [P] | `isConfigSupported` alone is never accepted as proof |
- **Honest parity definition:** export is frame-exact; paused and frame-step preview are frame-exact (WebCodecs); *playing* preview may substitute the nearest decoded frame but uses identical composition. `<video>` is **not** frame-accurate, so either a WebCodecs preview player is built (seek, buffering, A/V sync; budgeted in P5) or preview timing is explicitly approximate with a shared shader. The decision is recorded after `G2-RENDER` (R9).
- **One working color space:** SDR BT.709 / sRGB display-referred, outputs explicitly tagged (`colr`), HDR inputs refused or tone-mapped, never silently mis-rendered.

### 4.4 `G2-RENDER` (summary; R1–R12 thresholds in `docs/adr/0000` §2i, Revision 4 additions R13–R15 and the register in `IMPLEMENTATION_PLAN.md` §2.1)

**Scope.** The gate proves the **whole** pipeline of section 4.3, not only compositing and encoding: demux/index, decode, scheduling, composite, encode, audio mix, mux and a **finalized, playable MP4/MOV** whose audio/video sync is measured on the file, with source and output timestamps judged by the time rules of `DATA_MODEL.md` §2.

**Runtime.** It runs inside the **pinned Electron/Chromium intended for the product** (hidden `BrowserWindow`, the production `backgroundThrottling:false` and GPU flags), never only in an unrelated standalone browser. The Electron version bump is therefore a prerequisite (`IMPLEMENTATION_PLAN.md` §3, P0b-min), and R1/R6/R7 are re-run on any later Electron major or minor bump.

**Hard kill → consider the native fallback:** non-deterministic seek or step (R1/R2); hardware encode not *proven* (R6); 1080p30 composite scene below **1.0x realtime** (R7); unbounded memory (R5); demuxer wrong on VFR/edit lists with no fix in 3 working days (R3); **new:** no candidate mux path produces a finalized file that opens in QuickTime/AVFoundation with A/V offset ≤ 1 frame (R13/R14). Downgrade only: color mismatch (R4), 1080p60 (R8), preview player (R9). 4K60 is informational.

---

## 5. Media pipeline and memory on 8 GB (question C)

### 5.1 Measure the right thing

| Metric | Use |
|---|---|
| **Physical footprint** (`footprint <pid>`) | **Primary per-process budget metric** |
| RSS | Diagnostic only; double-counts shared pages; **never a pass metric** |
| IOSurface / GPU shared memory (`vmmap --summary`) | Reported as its own line, counted once (Apple silicon is unified memory) |
| `memory_pressure`, `vm.swapusage` | **System gates** |

### 5.2 Proposed budgets [P] (calibrated against the P0a baseline; none measured)

| Level | Budget |
|---|---|
| Per process, steady state p95 after 5 min | helper <= 350 MB; main <= 250 MB; recorder renderer <= 250 MB; editor renderer <= 700 MB (60-min, 4-source project); export renderer + GPU <= 1.5 GB combined |
| Whole app (process-tree sum) | recording <= 2.0 GB; editing idle <= 2.0 GB; editing playback <= 2.5 GB; export <= 3.0 GB (leaves >= 2 GB for macOS and other apps) |
| System | `memory_pressure` stays *normal*; swap growth <= 100 MB per run; no jetsam, no crash report |
| Leak slope | <= 5 MB per 10 min per process after warm-up (120-min run included) |

### 5.3 Strategies that prevent unbounded growth

- **Decoders:** hard cap [P] of 4 concurrent decoders; every `VideoFrame` closed within 2 render ticks (instrumented create/close counter); <= 6 frames alive per source, <= 24 total; `decodeQueueSize` <= 8, `encodeQueueSize` <= 4; encoder back-pressure pauses decode.
- **Capture:** small SCK `queueDepth`; bounded writer queues that drop-and-count instead of growing; IOSurface zero-copy into VideoToolbox.
- **Preview:** adaptive quality tied to playback load; 720p H.264 proxies in the background; ffmpeg-generated audio peaks replace the PRNG waveform [V `BezierAudioWaveform.tsx:25-27`]; sprite-sheet thumbnails; LRU byte-capped caches (today unbounded [V `thumbnail-cache.ts`]).
- **Audio:** never `arrayBuffer()` + `decodeAudioData` a whole file in the renderer [V `media-utils.ts:320-345`]; stream PCM windows from ffmpeg.
- **STT:** one quantized Whisper pipeline (Transformers.js in a `utilityProcess` or whisper.cpp/Metal), decided by the B8 measurement; disposed after use; model pinned. Today there are two resident pipelines [V]. Remove ACE-Step (3.5B model, fp32 on macOS [V]).
- **Long recordings:** background jobs run at low QoS, paused during recording and export, and react to memory-pressure events. Free-disk guard: refuse to start below a threshold, warn and auto-stop with N minutes left (today none [V]).
- **Export:** segment-wise or bounded-input graphs; hardware `VideoEncoder`; bitrate scaled by resolution/fps (today fixed 8M [V `ffmpeg.ts:884,923-925`]).

Disk rate for topology M (2 displays HEVC 10–20 Mbps, 2 cameras 6 Mbps, 2 LPCM tracks 1.536 Mbps): 35.07–55.07 Mbps = **263–413 MB/min** [S, arithmetic]. T5 (120 min) needs roughly 32–50 GB, so an external SSD is a `G1-CAPTURE` prerequisite (the repository volume had 3.5 GiB free).

---

## 6. Synchronization, project model, audio (question D, summary)

Full definitions in `DATA_MODEL.md`. Architecture-level rules:

1. **One clock for capture: host time.** SCK and AVCapture timestamps are *converted* (`CMSyncConvertTime` from each session's `synchronizationClock`), not assumed equal [H].
2. **Not "one offset", and not two representations.** Each file-backed `MediaSource` carries one piecewise-linear `TimeMap` (start offset, calibration `K`, timestamp jumps; drift reserved and validated to 0 until measured). `captureOffsetTicks` no longer exists in any document: `MediaSource.timeMap` plus `CaptureSession` are the single synchronization representation, populated by native, Chromium and recovery importers from the capture manifest (`DATA_MODEL.md` §6.3).
3. **`mach_absolute_time` does not advance during system sleep** (`mach_continuous_time` does) [H, verify]. Never mix host time with wall clock for durations. Sleep auto-pauses recording (exists [V `main.ts:853`]); the helper re-anchors after wake.
4. **Pause:** the capture manifest is the single authoritative owner of pause ranges (host time). Record continuously and import the ranges into `CaptureSession.pauses` (preferred), or start a new segment per resume anchored to the same host T0 (a gap, not a stored range). Dropping and retiming buffers risks clicks and non-increasing-timestamp writer errors [H, test T9]. Pauses live on the capture-time axis and never inside `TimeMap`.
5. **Time units and arithmetic:** stored time is integer flick `Ticks` (1/705,600,000 s). `HostNs`, `Micros`, `Sec` exist only at named boundaries; products with non-tick factors use `bigint` with a checked return to `Number`; rounding is stated per boundary and exactness is claimed only where it holds (`DATA_MODEL.md` §2).
6. **Audio:** one `AudioMixPlan` derived from the document replaces three implementations (WebAudio preview, renderer decode for transcription, ffmpeg `amix normalize=0` for export). Preview interprets it with WebAudio, export compiles it to a streaming ffmpeg graph with `acrossfade`, `alimiter`, optional two-pass `loudnorm`. Parity is verified numerically (RMS/peak/LUFS).

---

## 7. AI and MCP architecture

**Responsibility split (Revision 4).** Swift: native capture, encoding, native recovery. Electron main: process supervision, security, IPC, document persistence. TypeScript: MCP, AI gateway, domain operations, proposal validation. Renderer: UI, timeline, preview. Nothing is added to the Swift helper to satisfy a principle.

### 7.1 Alternatives for the MCP entry point (brief)

| Option | Where MCP logic lives | Launch path for the MCP client | For | Against | Verdict |
|---|---|---|---|---|---|
| A. Swift `mcp-bridge` subcommand (Revision 3) | Swift relays bytes; domain in Main | helper executable | One native binary; fuse can go `false` | A non-native responsibility in the capture helper; MCP availability and signing coupled to the capture gates; the MCP SDK, Zod schemas and domain package are TypeScript, so every schema lives on the wrong side of a byte relay; Swift cannot validate | **Superseded** (kept as a fallback only if B's packaging fails) |
| **B. TypeScript `ovc-mcp` executable ↔ Main over an authenticated local socket** | TS: MCP SDK, schemas, compile-to-ops, pre-validation (same package Main uses) | small signed executable (Node single-executable or bundled Node: **packaging, size, signing and start time unverified [H]**) | One language across the AI path; schemas shared with the domain; independent of capture helper gates; client-side validation without a second implementation (same code) | One more nested Mach-O to sign and notarize; an extra process; packaging not yet proven | **Proposed**, gated by `G-MCP` |
| C. Main hosts MCP (local Streamable HTTP or socket) + stdio shim | TS in Main | shim still required for stdio-only clients [H] | No separate MCP process for HTTP-capable clients | A listening endpoint widens the auth surface; the shim is option B anyway | Not adopted; revisit after `G-MCP` |
| D. Today: `ELECTRON_RUN_AS_NODE=1` against the app binary [V `src/main/ai-connection.ts:84,89`] or Electron `--mcp` | Electron binary as Node | app executable | Works now | Needs fuse `runAsNode:true` (M1: any same-user process borrows the app's grants); `--mcp` boots Chromium per client and fights the single-instance lock | **Rejected** as the end state |

### 7.2 Decision and rules

- **One implementation, one authority.** `src/shared/editor-domain` (TypeScript) is the only code that validates, applies, previews, commits and undoes operations. `ovc-mcp` and Main both import it; `ovc-mcp` pre-validates for fast rejection, and **Main re-validates authoritatively** with the same code. A main-process `DocumentService` is the only writer of `editor.json`; the renderer keeps an optimistic replica (gesture state never persisted). **Conditional on P3.9 latency measurement** (commit round-trip p95 <= 50 ms [P]); fallback: renderer keeps authority, main hosts a read replica.
- **Transport:** MCP stdio client → `ovc-mcp` → Unix domain socket in `userData` (mode 0600) → AI gateway in Main. Authentication: per-launch random token in a 0600 file read by `ovc-mcp`, plus a same-uid peer check (`getpeereid`/`LOCAL_PEERCRED` [H, verify]); versioned `hello` handshake; newline-delimited JSON frames with `seq`. macOS limits `sun_path` to 104 bytes [H, verify], so the socket path is chosen short. This design allows fuse `runAsNode:false` (fixes M1) **only after** the `ELECTRON_RUN_AS_NODE` launch in `ai-connection.ts` is replaced by `ovc-mcp`.
- **App not running:** `APP_NOT_RUNNING`, or an opt-in background launch (`ai.allowBackgroundLaunch`, default off). **Revision 4 note:** with a TypeScript client an offline *read-only* path is technically possible (same parser) but is **not adopted**: it would expose a stale snapshot beside the live authority and needs lock/CAS-read semantics. Offline mutation stays excluded (single writer, approvals). Revisit after `G-MCP`.
- **Tool surface (typed, compiled to operations):** inspect (`get_project`, `get_timeline`, `list_sources`, `get_transcript`, `get_history`), analysis jobs, proposals (`create_proposal{baseRevision}` → `add_operations` → `preview_proposal` → `commit_proposal` | `discard_proposal`), editing helpers (tracks, clips, transitions, effects, overlays, subtitles, audio, templates), preview (`render_frame`, `render_clip`), export (`prepare_export`, `start_export`), history (`undo_transaction`).
- **Rules:** one Zod schema checked against the TS types by a mandatory drift test (the two have drifted today [V: `set_text_overlay` lacks `fontFamily`/`opacity`, `set_background` lacks `animated-*`]); each commit is one undo entry with `actor: agent`; `clientRequestId` idempotency; typed errors (`VALIDATION_FAILED, REVISION_CONFLICT, LOCKED, APPROVAL_REQUIRED, OUT_OF_SCOPE, APP_NOT_RUNNING, ...`); per-project AI policy (read-only / propose-only / auto-apply non-destructive).
- **Boundaries (non-negotiable):** no shell, no raw filesystem paths, no network fetch through MCP. Destructive operations (`remove_ranges`, `delete_clip`, `replace_subtitles`, track deletion) and `start_export` **always require approval in the app UI**. Media import requires a user consent grant issued in main (fixes M5 without relaxing the preload gate). The Gemini agent uses the same gateway, with per-project upload consent and DELETE after the session (fixes M2).

---

## 8. Security, dependencies, fork identity (question E)

### 8.1 Fork identity and update isolation [V]

- `package.json` `build.publish` points to `Reubencfernandes/Open-Video-Craft`; `appId` is `com.openvideocraft.app`; the Team ID is in `scripts/verify-mac-release.mjs` and `release.yml`.
- `src/main/auto-updates.ts` checks for updates whenever `app.isPackaged`: 5 s after launch and every 4 h. An unretargeted packaged fork would **auto-download upstream builds** if upstream publishes a version above ours.
- **Therefore:** a packaged build must never run on the fork before identity is retargeted or updates are disabled. This also constrains the baseline: P0a runs **unpackaged** (`electron .`, where `isPackaged` is false and checks are skipped) or packaged with the network blocked, and the launch mode is recorded.
- P0b-min: new appId, productName, `publish` target (fork repo), fork Team ID; `autoDownload` off until the fork's feed exists; never point at upstream's feed. The Team ID currently in the repository belongs to upstream; the fork's own Team ID requires the Apple Developer account described in `IMPLEMENTATION_PLAN.md` §7, which is **not assumed to exist**.

### 8.2 Dependencies

The audit reports **39 advisories** from `npm audit --package-lock-only` (3 critical, 28 high, 8 moderate), including Electron 43.0.0 (range `43.0.0-alpha.1 – 43.8.0`), `zod < 4.6.6`, `@modelcontextprotocol/sdk <= 1.31.0`; the critical entries are dev/build tooling (`concurrently`, `shell-quote`). These are **reported findings, not a verified runtime state**. **P0b-min** bumps Electron (>= 43.8.1 or current) because `G2-RENDER` must run on the Electron/Chromium intended for the product and no packaged build may exist before identity is fixed; zod, the MCP SDK, `npm audit` in CI, SHA-pinned actions and scoped `contents: write` are non-blocking hygiene (P0b-hygiene) and are not scheduled ahead of the gates. The original baseline is deliberately measured on the vulnerable version, locally and with no network features beyond approved fetches.

### 8.3 Process and IPC hardening

- Fuses: `runAsNode` is currently **true** [V `package.json` electronFuses] and `disable-library-validation` is on, so any same-user process can run JS under the signed binary and borrow its camera/microphone grants. Target `runAsNode:false` (after `ovc-mcp` replaces the `ELECTRON_RUN_AS_NODE=1` MCP launch [V `ai-connection.ts:84,89`]; gated by `G-MCP`), plus `enableCookieEncryption` and `grantFileProtocolExtraPrivileges:false`.
- IPC: 57+4 inline `ipcMain.handle` registrations with partial validation and no sender checks [V]. Replace with `registerHandler(channel, zodSchema, handler, {allowedWindows})` that validates payload and checks `event.senderFrame.url` origin and window identity. Migrate channel by channel, one test each.
- Media protocols `ovc-media` / `ovc-import`: keep containment and range support; echo the app origin instead of `Access-Control-Allow-Origin: *` [V `media-protocols.ts:83`]; contract tests for traversal, junctions, wrong origin.
- Gate `VITE_DEV_SERVER_URL` on `!app.isPackaged` (packaged build currently honors it with full IPC [V `main.ts:467`]).
- API keys: refuse or ask consent for the base64 plaintext fallback when the keychain is unavailable; remove `providers:reveal` [V `provider-keys.ts:40,155`, `main.ts:880`].
- Exports: write to `.part` then rename, add `-nostdin` (M6); `powerSaveBlocker` while recording/exporting (M9).

### 8.4 Distribution and licensing

| | **Initial open-source DMG (in scope)** | **Future Mac App Store (out of scope, not deleted)** |
|---|---|---|
| Signing | Developer ID, hardened runtime, notarization, stapling, arm64-only. **Prerequisites, not assumed:** paid Apple Developer Program membership, a Developer ID Application certificate, notarization credentials, CI secret handling (`IMPLEMENTATION_PLAN.md` §7, `G-DIST`) | App sandbox required; the helper must be sandboxed and inherit |
| FFmpeg | GPLv3 static build allowed with the fork's own source offer | Not shippable as is; needs LGPL FFmpeg (VideoToolbox only, no x264/x265) or AVFoundation encode |
| Entitlements | camera, audio-input; no `allow-jit` / `disable-library-validation` if possible | Sandbox entitlements; no library-validation bypass |
| Code | Stop maintaining MAS/bookmark code (dead weight) | Reinstate only on a decision |

**Questions for specialist review. No legal conclusions are drawn here:** (1) GPLv3 aggregation vs combined work for a separate ffmpeg executable inside an app with another license, and the form of the source offer; (2) H.264/HEVC patent exposure of bundled x264/x265 vs system VideoToolbox encoders; (3) Whisper model/weights licenses and redistribution; (4) bundled overlay-font licenses for exports; (5) privacy/consent for uploading recordings to Gemini or cloud STT; (6) fork name and trademark relative to "Open Video Craft".

---

## 9. Crash recovery and reliability

- Today: chunks append every 5 s [V] but nothing repairs projects stuck in `recording`/`processing` at launch [V], and raw WebM has no duration/cues.
- Target: the helper rewrites `capture-session.json` atomically on every state change and every 5 s; a launch-time **recovery service** scans for projects in `recording`/`processing` or sessions with an unfinalized manifest, repairs (fragment recovery or remux), probes, imports (`CaptureSession` + `timeMap`) and marks `recovered` with a user-visible notice. The helper also exposes a standalone `recover <sessionDir>` subcommand (native recovery stays in Swift).
- **What forced-termination testing does and does not prove.** `G1-CAPTURE` T7 kills processes (`kill -9` of the helper, of Main while the helper lives, of both). That tests recovery after *process* death, where the OS page cache still reaches disk; it does **not** test power loss or a kernel panic, where unflushed data is lost. Fsync cadence and the container choice are therefore judged on process-kill evidence plus design, and the residual power-loss risk is stated, not claimed away.
- Crash-safe container is an **output of `G1-CAPTURE`**, not an assumption: `movieFragmentInterval` is weakly documented and reportedly works only for QuickTime `.mov`; candidates are fragmented `.mov`, HLS/CMAF segment delegate (fsync each segment), or segmented files; CAF crash survival depends on the data-size header and is tested (T7).
- Device loss, display hot-plug, sleep, lid close, lock screen, fast user switching and disk-full are handled by per-track segment rollover and typed events; the other tracks keep recording.

---

## 10. Quality, tests, budgets pointers

Budgets and methodology are in `IMPLEMENTATION_PLAN.md` §4, the test strategy in §5, the risk register in §6. Performance and quality budgets are **proposed targets**: they are ratified by `G0-THRESHOLDS` against the P0a measurement before `G1-CAPTURE` runs, and **remain proposed until measured on the target M1 8 GB machine**; the architecture does not claim any of them is met.

---

## 11. Differences from Revision 2 (`docs/adr/0000`)

1. **P0a launch mode:** the baseline must not run packaged against upstream's update feed (section 8.1). Rev 2 allowed `electron-builder --dir`.
2. **XPC service** added as a fourth integration option, kept as a G-TCC fallback rung.
3. **WebGPU evaluated** and deferred behind `G2-RENDER` findings.
4. **Incremental parity stage** made explicit: shared scene evaluator drives CSS preview and ffmpeg export for static layouts before the GPU compositor.
5. **Sync generalized** from offset + drift to a per-source piecewise-linear `TimeMap`.
6. **Host-clock sleep behavior** called out as an item to verify.
7. **Chromium-engine per-track offsets** become a planned slice, because the Chromium engine remains the hybrid-camera fallback (C6). *(Revision 4: they are carried by the same capture manifest, not by a separate offset field; section 6.)*
8. **New budgets:** recording start latency and GPU usage with thermal state.
9. **Security notes** from direct inspection: fuse `runAsNode:true`, `allow-jit` and `disable-library-validation` in `build/entitlements.mac.plist`, `NSScreenCaptureDescription` key, no `NSAudioCaptureUsageDescription`, mac target without `arch`.

---

## 12. Differences from Revision 3

1. **Time model formalized** (`DATA_MODEL.md` §2, §4.2a, §4.2b, §6.3): exact `TimeMap` mapping and sign convention, source-axis `durationTicks`, calibration applied after drift, pauses owned by the manifest and removed from `TimeMap`, `bigint` arithmetic with checked conversions, honest exactness per boundary (ffmpeg "9 digits" claim withdrawn).
2. **Single synchronization representation:** `captureOffsetTicks` and `driftPpm` removed; `MediaSource.timeMap` + `CaptureSession` are authoritative; all importers feed them from the manifest.
3. **Clip timing and typed transitions:** rational speed with bounds (zero and negative rejected), derived timeline duration, overlap and source-bound rules, frame snapping rules; transitions use a typed versioned registry shared with effects, semantics preserved from v2.
4. **MCP moved to TypeScript** (`ovc-mcp` ↔ Main socket); the Swift helper no longer hosts `mcp-bridge`; "single-helper rule" becomes "native capture rule".
5. **Rendering pipeline completed** (section 4.3): demux/index, decode, scheduling, compositing, encode, audio, mux, container, VFR/edit lists, hardware proof; `G2-RENDER` proves it end to end in the pinned Electron with a playable finalized file; Stage-1 ffmpeg parity made conditional.
6. **Performance validation strengthened** (`G1-CAPTURE` tiering, editor-open and concurrent-export scenarios, memory pressure, thermal, forced-termination scope).
7. **Roadmap simplified** around two gates; v3 migration, advanced AI, templates and secondary features moved behind them; P0b split into P0b-min and hygiene.
8. **Distribution split:** technical feasibility (`G-SIGN`, `G-TCC` on ad-hoc/dev signing) vs distribution readiness (`G-DIST`); Apple Developer account, Developer ID, notarization credentials are explicit prerequisites and not assumed.
9. **Consistency:** one gate vocabulary; one status (Proposed) for every decision; ADR numbering mapped (`ADR.md`); undo depth corrected to 50.
