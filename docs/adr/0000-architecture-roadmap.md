# Architecture & Implementation Roadmap — Open Video Craft macOS fork

> **Revision 2 (2026-11-15).** Incorporates nine corrections requested after architectural review. Sections §2c–§2j are **normative**: where older text and §2b–§2j disagree, §2c–§2j win, and known conflicting text has been patched in place. The change list is in §12 and the register of still-conditional decisions is in §13.

Planning document only. Nothing was implemented, installed, built, tested or benchmarked to produce it. No file in the repository was touched.

## 0. Context

The fork's goal is a lightweight, professional, macOS-first recorder and editor. The primary target is a **MacBook Pro M1 with 8 GB RAM**, minimum OS **macOS 14.2** (user decision, 2026-11-15), shipped as a signed and notarized DMG.

The three fork audits (`AUDIT.fork.md`, `FEATURE_GAP_ANALYSIS.md`, `TEST_BASELINE.md`, baseline `main@143a0d6`) show the following:
- The **editor domain and project containment are solid assets**.
- **Capture** (Chromium MediaRecorder VP9 WebM, no sync offsets, no recovery) and **export** (an ffmpeg filtergraph that drops camera, layout, background, corners and styled subtitles) do not meet the product promise.

This plan decides what to keep and what to replace, and in what order. Expensive decisions are gated behind measured proofs of concept rather than taken on assumption. Where this plan disagrees with the audits, it says so.

The pasted brief was truncated after roadmap item "5. Preview/export rendering". The phases after that are this plan's proposal.

### Evidence legend (used throughout)
- **[V]** verified by reading code at the cited path (re-checked in this session through three read-only exploration passes plus spot checks).
- **[S]** static estimate or arithmetic.
- **[H]** hypothesis that a proof of concept or test must confirm.
- **[P]** proposed target or budget, to be calibrated against the Phase 0 measured baseline.

No benchmark or test result exists for this baseline. The pass/fail state of the existing ~367 tests is **unknown**.

### Verified facts that shape the architecture (new or sharpened vs. the audits)
1. **The UI does not use the domain operations.** `applyEditorOperations` is called only from `editor-document-store.ts:103`, the MCP/Gemini path [V]. UI edits mutate React state and save full snapshots (`useEditorPersistence.ts:568`) [V]. So "AI and UI share the same domain ops" is **not true today**. It is a refactor target.
2. Document shape [V]:
   - `EditorDocument{schemaVersion:2, revision, savedAt, state, imports, lastMutation}` (`types.ts:182`).
   - A flat `EditorStateSnapshot`. Clips are `TimelineSegment{track, lane, start, end, sourceStart}` in float seconds (`types.ts:40`), with no `sourceEnd` and no track entities.
   - Zoom and speed are global effect ranges. Layout, camera, background and corner settings are project-wide scalars.
   - 31 operation kinds, applied all-or-nothing on a `structuredClone`.
3. Migration is a single v1→v2 wrapper in `schema.ts:56-78`, and unknown versions return `null` [V]. Undo is renderer-only and segment-only, 50 entries (`useTimelineEditing.ts:114-300`) [V]. Agent undo is checkpoint-based (`.ovc/history`, 20 entries, latest mutation only) [V].
4. The Zod `operationSchema` has drifted from the TS union [V]: `set_text_overlay` lacks `fontFamily`/`opacity`, and `set_background` lacks `animated-*`.
5. Preview is a DOM/CSS compositor. Geometry is split between pure `layout-geometry.ts` and inline math in `useEditorDerivedData.ts:240-348` [V].
   - Export zoom differs: strengths are summed, there is no chaining, and easing is polynomial (`ffmpeg.ts:474-516`), versus a cubic-bezier chain in the preview (`zoom-utils.ts:17-185`) [V].
   - Six constants are hand-copied between preview and export [V].
6. MCP and Gemini write `editor.json` directly. The renderer learns of changes via `fs.watch` → `editor:project-state-changed` (`main.ts:818-835`) [V]. MCP scope control is category matching (`server.ts:264-338`). Gemini skips it [V].
7. IPC is 57+4 inline `ipcMain.handle` registrations with no sender checks. Validation is partial (`request-validation.ts`) [V].
8. Process supervision already exists and is reusable [V]:
   - `runProcess` (`ffmpeg.ts:991-1085`): spawn, AbortSignal→SIGKILL, timeout, progress parsing, stderr tail.
   - `ExportJobRegistry`.
   - Kill-all on `will-quit`.
9. `edits.json` and `subtitles.json` are written at creation and never read [V]. They are vestigial.
10. Free disk on the working volume was **3.5 GiB** at audit time (`TEST_BASELINE.md:85`). That is a practical blocker for `npm ci`, Xcode builds and multi-track recording tests.

---

## 1. What to preserve, refactor, isolate, replace

| Asset | Decision | Why |
|---|---|---|
| `src/shared/editor-domain/*` (ops, validation, atomic apply) | **Preserve and promote** to the single mutation path; evolve to schema v3 | Best-tested area. Already shared by MCP and Gemini. |
| `project-containment.ts`, `media-protocols.ts`, atomic `project-file.ts` writes, `editor-document-store.ts` CAS + lock | **Preserve** | Correct, tested security and durability primitives. |
| `runProcess`, `ExportJobRegistry`, `ffmpeg-progress.ts` | **Preserve and generalize** into a `ProcessSupervisor` reused for the capture helper | Already handles cancel, timeout and progress. |
| `layout-geometry.ts`, `zoom-utils.ts`, text-wrap and metrics code, `playback-clock`/`playback-sync` | **Refactor**: move pure math into `src/shared/render/`; delete the hand-copied export variants | Becomes the single source for the scene evaluator. |
| `ffmpeg.ts` (1,104 lines) | **Split** into a probe/remux/proxy/audio toolbox. Its video compositing role is **retired** after parity GA. | ffmpeg stays for muxing, probing, audio and proxies; it stops owning the visual semantics. |
| Renderer capture (`RecorderController`, `recorder-utils`, MediaRecorder) | **Isolate behind `CaptureEngine` interface** and keep it as a fallback until native GA, then remove | Rollback path if the native PoC fails. |
| `PreviewContent`/CSS compositing | **Replace** with the WebGL compositor fed by the scene evaluator (Phase 5) | Parity cannot be guaranteed by two independent implementations. |
| MCP stdio server | **Preserve stdio and the tool idea; re-host the mutation path** in the app (Phase 9) | Single writer, approvals, undo. |
| ACE-Step music, MAS/bookmark code, Windows targets, x64 slice, main-process `onnxruntime-node` Whisper | **Remove or de-scope** (phased) | 8 GB hazards and dead weight for a DMG-only arm64 fork. |
| `edits.json`, `subtitles.json` | **Stop writing**; tolerate on read | Vestigial [V]. |

---

## 2. Architecture decisions (condensed ADRs)

### ADR-1 Native capture stack — Swift, ScreenCaptureKit + AVFoundation + VideoToolbox (validated by PoC)

| Source | API | Notes |
|---|---|---|
| Each display | **ScreenCaptureKit** `SCStream`, one per display, `SCContentFilter(display:excludingApplications:…)` | Retina at native pixel size; `showsCursor` configurable; IOSurface-backed `CMSampleBuffer`s. Concurrent streams [H, PoC must prove on M1]. |
| System audio | **SCK `capturesAudio`** on one designated stream (macOS 13+). Alternative: **Core Audio process tap** (14.2+) for per-app/system audio independent of screen capture. | SCK audio is tied to a stream's lifetime. The PoC compares both for drift and robustness [H]. Excluding our own app's audio: `excludesCurrentProcessAudio`. |
| Each webcam | **Selected by test among candidates C1–C6 of §2g.** Leading candidate: independent `AVCaptureSession`s. `AVCaptureMultiCamSession` is **not listed for macOS** (iOS/iPadOS 13, Mac Catalyst 14, tvOS 17, visionOS 2.1) | Not assumed to work. Concurrency across USB cameras depends on bus bandwidth and device firmware [H]. Choose device formats explicitly. |
| Microphone(s) | **AVFoundation** audio device input per mic (deterministic device binding). `AVAudioEngine` only if live DSP is needed. | `AVAudioEngine` binds to one input device per engine, so it is less natural for N mics. |
| Encode | **VideoToolbox through `AVAssetWriter`**: HEVC (default) or H.264, hardware, per video track. Audio: **LPCM in CAF** (crash-tolerant, editable) | Fragmented movie (`movieFragmentInterval`) for crash recoverability [H]. Encoder throughput for 2× Retina + 2× 1080p on one M1 media engine is the **#1 PoC risk** [H]. |
| Cursor/clicks (later) | `CGEventTap` (listen-only, Input Monitoring permission) on the same host clock | Phase 8+, optional. |

Why not ScreenCaptureKit alone: it does not capture webcams. Its microphone output is macOS 15+, below our 14.2 floor. Multiple-microphone selection is outside its scope.

Why native at all: Chromium on macOS has no hardware VP9 encode. The current path records up to 24 Mbps software VP9 [V `quality.ts:17-22`]. There are no per-track timestamps [V]. System audio loopback is unverified [V `desktop-permissions.ts:59-76`].

### ADR-2 Integration — one standalone Swift helper process, supervised by Electron main

Comparison (static assessment):

| Criterion | **Standalone helper (chosen)** | Swift framework in-process via addon | N-API addon (ObjC++/Swift) |
|---|---|---|---|
| Crash containment | A helper crash leaves the editor alive; partially written files are recoverable | A crash kills main and loses the UI | Same as in-process |
| Electron upgrades | No ABI coupling | Rebuild per Electron ABI | Rebuild per Electron ABI |
| IPC overhead | Control messages only (KB/s); media never crosses IPC | Lowest | Lowest |
| Memory | +1 process (Swift runtime, small) [S] | None extra | None extra |
| Debugging | Xcode/lldb directly, `swift test`, runs standalone from CLI | Mixed JS/native stacks | Mixed |
| Signing | One extra nested Mach-O signed with Team ID + hardened runtime | Same | Same |
| Maintainability | Clean language boundary, testable without Electron | Bridging glue | Bridging glue |

The IPC cost is irrelevant because **frames never cross the boundary**: the helper writes files and reports metadata.

#### Single-helper rule
- Exactly **one** native process (`ovc-capture`) owns all capture, with **no swarm of daemons**.
- Later native needs, such as a native render fallback or native thumbnails, attach to the **same** helper binary as separate subcommands or modes, never as new resident processes.

#### Packaging
- The helper ships as a nested executable inside the `.app`: `Contents/MacOS/ovc-capture`, or a nested helper `.app` if TCC or usage-string attribution requires it [H, see PoC T-perm].
- `afterPack` copies it, as `scripts/after-pack.cjs` does for ffmpeg [V]. The helper is signed with entitlements `device.camera` and `device.audio-input`. Screen recording is a TCC grant, not an entitlement.

#### Protocol v1 (newline-delimited JSON over stdio; stderr = logs)
- **Schemas:** the source of truth is JSON Schema files in `native/protocol/v1/*.schema.json`. They generate TS types plus a Zod validator (`src/main/capture/protocol.ts`) and Swift `Codable` types. Contract tests run on both sides against shared fixtures.
- **Envelope:**
  - Request: `{v:1, id, type, payload}`. Response: `{v:1, re:id, ok, payload|error}`.
  - Event: `{v:1, event, seq, payload}`.
  - `seq` is monotonic, so a gap means messages were lost.
- **Handshake:**
  1. Main spawns the helper.
  2. The helper emits `hello{protocolVersions:[1], helperVersion, os, capabilities}`.
  3. Main replies `init{protocolVersion:1, sessionToken}`.
  - A version mismatch leads to a typed error, and the app falls back to the Chromium engine (feature flag).
- **Requests:**
  - `permissions.status`, `permissions.request{kind}`
  - `sources.list` (displays with pixel size, scale and refresh; cameras with formats; mics; audio taps)
  - `session.prepare{sessionDir, tracks[], clock:"host"}`, `session.start`, `session.pause`, `session.resume`, `session.stop`, `session.abort`
  - `ping`
- **Events:**
  - `state{idle|preparing|ready|recording|paused|stopping|finalized|failed}`
  - `track.started{trackId, firstPtsHostNs}`
  - `stats{perTrack: frames, dropped, bytes, encoderLatencyMs, queueDepth}` at 1 Hz
  - `level{trackId, rmsDb, peakDb}` at 10 Hz (audio meters)
  - `thumb{trackId, path}` at ≤1 Hz (tiny JPEG written into the session dir, so the recorder UI preview does not stream frames over IPC)
  - `device.lost{trackId, reason}`, `device.restored`, `warning{code}`, `error{code, message, fatal}`
  - `finalized{manifestPath}`
- **Lifecycle:**
  - Main spawns the helper when the recorder window opens (warm start) and kills it when the recorder is idle for N minutes.
  - **Parent death:** stdin EOF → helper finalizes all writers → writes the manifest → exits 0.
  - **Helper death:** main sees exit → marks the session `interrupted` → recovery (ADR-1 fragments plus the manifest) runs immediately or at next launch.
  - **Heartbeat:** `ping` every 2 s. 3 misses → main sends SIGTERM, then SIGKILL after 5 s, then recovery.
- **Media ownership:**
  - Main creates `sessionDir` inside the contained project folder and passes only that path. The helper refuses any path outside `sessionDir` (realpath check). The helper never deletes files.
  - After `finalized`, ownership passes to main, which imports the session into the project as MediaSources.
- **Error codes:** `PERMISSION_DENIED`, `SOURCE_UNAVAILABLE`, `DEVICE_LOST`, `ENCODER_UNAVAILABLE`, `ENCODER_OVERLOADED`, `DISK_FULL`, `DISK_SLOW`, `INVALID_REQUEST`, `INVALID_STATE`, `INTERNAL`. Each error carries a `fatal` flag; non-fatal errors keep recording the other tracks.

#### Session manifest
`capture-session.json`, owned by the helper and rewritten atomically on every state change and every 5 s:

```
{ manifestVersion:1, sessionId, hostClock:{timebaseNumer,timebaseDenom}, anchorHostNs,
  pauses:[{startHostNs,endHostNs}], tracks:[{trackId, kind:display|camera|mic|systemAudio,
  deviceId, file, codec, width, height, fps, sampleRate, channels, firstPtsHostNs, lastPtsHostNs,
  framesWritten, framesDropped, status}], status, endedAtHostNs? }
```

### ADR-3 Shared clock and synchronization
- **One clock: host time** (`mach_absolute_time` / `CMClockGetHostTimeClock`).
  - SCK sample buffers are in host time [H, verify].
  - AVCapture buffers are converted from `session.synchronizationClock` with `CMSyncConvertTime` [H].
- **Per-track offset** = `firstPtsHostNs − anchorHostNs`, where the anchor is the earliest `track.started`. On import, offsets become each MediaSource's `captureOffsetTicks` (ADR-5; converted from `…HostNs` at the importer boundary, §2c), so the editor places tracks correctly instead of at `sourceStart:0` [V current bug].
- **Pause:** dropping and retiming buffers risks audio clicks and writer errors from non-increasing timestamps [per review, to be proven by PoC T9].
  - Preferred: **record continuously** and store pause ranges in the manifest; the importer turns them into timeline cuts or gaps.
  - Alternative if continuous recording is unacceptable on disk: start a **new segment per resume**, with all writers' sessions anchored at the same host-time T0.
  - Either way, pause intervals live in the manifest and relative sync is preserved by construction.
- **Drift:** audio device clocks can drift from host time [H]. The PoC measures drift over 60 min. If it exceeds budget, the helper applies sample-rate compensation (resample) at write time, or the importer stores a per-source `driftPpm` used at render time.
- **Sleep/wake:** auto-pause on `willSleep` (exists today [V `main.ts:853`]). The helper re-anchors after wake and verifies continuity.

### ADR-4 Rendering — shared scene evaluator + single GPU compositor (spike-gated)

Options considered:

| Option | Parity | 8 GB fit | Effort | Verdict |
|---|---|---|---|---|
| Keep extending the ffmpeg filtergraph | Two implementations, already diverging [V] | Per-frame upscale zoom is heavy [V] | L | Reject as visual engine |
| AVFoundation `AVVideoComposition` + custom Metal/CoreImage compositor (native export) with CSS/WebGL preview | Two backends; text (Core Text vs Canvas) is the classic divergence | Good | XL | **Fallback** |
| Native compositor for both preview and export (frames shipped to Electron) | One backend | Frame transport into Chromium is awkward | XL+ | Reject |
| **WebGL2 compositor in Chromium for preview *and* export; WebCodecs decode/encode; ffmpeg for audio/mux** | **One backend, one shader set** | GPU-resident frames; bounded decoders | L–XL | **Chosen, behind spike R-PoC** |

#### Design
- **Scene evaluator** (`src/shared/render/`, pure TS, no DOM): `evaluateScene(doc, tTicks, ctx) → RenderScene`.
  - The scene is an ordered layer list of `{sourceRef, sourceTimeTicks, crop, transform(2D affine), opacity, cornerRadiusPx, border, shadow, mask, blend, effects[]}` plus text/card layers referencing a raster cache key.
  - It holds all timing semantics: speed, transitions, zoom chains and keyframes. Preview and export call the **same function**.
- **Compositor** (`src/renderer/render/compositor/`): WebGL2. Frame sources are `HTMLVideoElement` (interactive preview) or WebCodecs `VideoFrame` (export, frame-exact scrub). The same shaders render both.
- **Text, cards and subtitles** are rasterized once per content change with Canvas2D/OffscreenCanvas into textures. Preview and export use the same raster code and the same bundled fonts.
- **Export** runs in a dedicated hidden renderer (or worker with OffscreenCanvas) so editor-UI memory is not involved:
  1. Demux MP4/MOV, decode with `VideoDecoder`.
  2. Composite.
  3. Build a `VideoFrame` from the canvas and encode with `VideoEncoder` (hardware H.264/HEVC [H]).
  4. Mux. Audio is rendered by ffmpeg from the same `AudioMixPlan` (ADR-6), and the final mux is stream copy.
- **GPU work:** YUV→RGB, scale, crop, zoom/pan, compositing, corner masks, borders, shadows/blur, transitions, color/LUT.
- **CPU work:** timeline and scene evaluation, layout math, text shaping and rasterization (cached), audio mix (ffmpeg streaming), mux, analysis.
- **Parity definition:**
  - Export is frame-exact.
  - Paused preview and frame-step preview are frame-exact (WebCodecs).
  - Playing preview may substitute nearest decoded frames but uses identical composition.
  - Golden tests compare compositor output for fixed inputs (Phase 5).
- **Spike pass/fail:** the full test list R1–R12, thresholds, the definition of "1.0× realtime", and the hard-kill versus downgrade rules are normative in §2i. In short: hard kill on non-deterministic seeking or stepping, unconfirmed hardware encode, 1080p30 below 1.0×, unbounded memory, or an unfixable demuxer; 1080p60, preview player and color are downgrades, not kills.
- **If a hard kill fires,** switch to the AVFoundation/Metal fallback **inside the existing helper**. It consumes the same serialized `RenderScene` JSON plus text rasters produced by the renderer, so text parity holds.

### ADR-5 Editor domain & project format v3
**Principle: domain operations become the only mutation path** (UI, MCP, Gemini, importers). UI handlers dispatch ops. The renderer keeps the document in a store and runs `applyEditorOperations` locally, then persists with the existing CAS.

Model, schema v3 (`src/shared/editor-domain`):
- **Time:** all stored time is an integer **flick `Ticks`** (1 tick = 1/705,600,000 s). Field names end in `…Ticks`, never `…Us`; units, conversion boundaries and rounding rules are normative in §2c. Frame snapping happens at render using each source's rational timebase. This removes float drift in ripple math.
- **`MediaSource`** `{id, kind: screen|camera|mic|systemAudio|import|generated, file(project-relative), probe{durationTicks, timebase, fps, width, height, codec, sampleRate, channels}, captureSessionId?, captureOffsetTicks, driftPpm?, proxies?{video720?, peaks?, thumbs?}}`.
- **`Track`** `{id, kind: video|audio|overlay|subtitle, name, order, muted, solo, locked, gainDb?, pan?, effects[]}`. This replaces `track+lane` integers.
- **`Clip`** `{id, trackId, sourceId?, timelineStartTicks, sourceInTicks, sourceOutTicks, speed (rational, incl. <1 slow-mo), transform?, keyframes?, effects[], gainDb?, fadeInTicks?, fadeOutTicks?, templateInstance?}`.
- **`Transition`** `{id, trackId, fromClipId, toClipId, type, durationTicks, params}`, with an audio crossfade companion.
- **`Effect`** `{id, type, version, params, enabled}` from a **typed registry** (versioned param schemas). Zoom becomes a composition-level effect track with keyframes (migrated from global `zoomEffects`).
- **Composition** `{width, height, fps, background, layout preset → per-layer transforms}`. Layouts become keyframable layer transforms, so a layout preset is just a template writing transforms.
- **Overlays:** text, image, shape, card, lower-third. These are clips on overlay tracks, optionally `templateInstance{templateId, version, slots}`.
- **Animation:** per-property keyframes `{tTicks, value, easing: cubicBezier|step|linear}`, reusing `zoom-utils` bezier.
- **Template** `{id, version, kind, params schema, layers}`, stored in the project with an optional user library in `userData/templates/`.
- **Audio processing** per clip (gain, fades), per track (gain, pan, mute/solo, effects: gate, compressor, EQ, limiter), and on the master (limiter, loudness target). This compiles to `AudioMixPlan`.
- **Subtitles:** a track with cues `{startTicks, endTicks, text, words[], styleRef}`, plus subtitle style presets.
- **AI provenance:** every mutation is a **Transaction** `{id, actor: user|agent:<name>, proposalId?, summary, ops[], baseRevision}`.
- **Undo/redo:** **document-level history of transactions** for all state (fixes M10).
  - Recommended: **Immer with patches.** Inverse patches give undo, and forward patches give AI diff summaries and an audit log.
  - The history is capped by entry count and byte size [P: 200 entries / 32 MB].
  - Adding the dependency is a Phase 3 decision, so it is not added now.
- **Migration registry:**
  - Chain v1→v2→v3 of pure, fixture-tested functions.
  - The first v3 write keeps `editor.v2.backup.json`.
  - Readers reject a *newer major* version with a typed error, and preserve unknown fields inside `extensions` for forward compatibility.
- **Project file layout:** keep `project.json` (bump to v2: references capture sessions instead of fixed `media/*.webm` keys), `editor.json`, `media/<sessionId>/…`, `.ovc/` (lock, history, analysis, proposals, proxies).

### ADR-6 Audio
- One **`AudioMixPlan`** (pure TS, in `src/shared/render/audio/`) is derived from the document.
  - Preview interprets it with WebAudio nodes.
  - Export compiles it to an ffmpeg filter graph that streams with bounded memory: `atrim/adelay/volume/acrossfade/amix normalize=0/alimiter[/loudnorm two-pass]`.
  - Transcription and analysis mixes use the same plan via ffmpeg PCM.
- This replaces three divergent implementations [V `FEATURE_GAP_ANALYSIS.md:34`].
- Parity is verified numerically: RMS, peak and LUFS within tolerance between WebAudio offline render of short windows and ffmpeg output.

### ADR-7 MCP / AI
- **All reads and mutations go through the running app (normative: §2h).** The MCP stdio client becomes a thin relay to the app's `DocumentService` over a local **Unix domain socket** in `userData` (mode 0600) authenticated by a per-launch token file.
  - One implementation (the shared TS `editor-domain` package), one authority (the main-process `DocumentService`, the only writer of `editor.json`), which owns undo and approvals.
  - App not running: `APP_NOT_RUNNING`, or an opt-in background launch (`ai.allowBackgroundLaunch`, default off). There is no offline read path and no offline proposal path, because either would need a second implementation.
- **Launch:** an `mcp-bridge` subcommand of the signed Swift helper that relays MCP stdio to the app's Unix socket, so the fuse `runAsNode:false` is possible (fixes M1). An Electron `--mcp` mode is rejected: it would boot Chromium per client, fight the single-instance lock and may show a Dock icon. This reuses the single-helper rule (a subcommand, not a new process kind). The bridge must work when the app is not running (clear error or lazy launch/reconnect).
- **Transactions/proposals:**
  - `create_proposal{baseRevision}` → `add_operations` → `preview_proposal` (diff summary from Immer patches plus rendered frames) → `commit_proposal` → `discard_proposal`.
  - Each commit is one undo entry with `actor: agent`.
- Details in §8.

### ADR-8 Distribution & licensing
- **DMG first:** Developer ID, hardened runtime, notarized, arm64-only.
- **Fork identity** before any build (H14): appId, productName, update feed, Team ID. Auto-update is **off** until the fork's own feed exists.
- **GPL:** the GPLv3 ffmpeg stays only for the DMG, with the fork's own source offer.
  - Once ffmpeg's role shrinks to probe/mux/audio/proxies, evaluate an **LGPL build** (no x264/x265; VideoToolbox encoders) to open a future Mac App Store path.
  - Legal questions go to a specialist (§7).

---

## 2b. Corrections from the independent adversarial review

These supersede anything above that conflicts. Source facts are from Apple/Chromium/Electron docs and forum threads cited by the reviewer; items marked "unverified" must be settled by the PoC.

**Hardware reality**
- An M1 13" MacBook Pro natively drives **one** external display, so "2 displays" means internal + 1 external (unverified spec recall; DisplayLink displays are virtual and behave differently). PoC T2/T3 are defined on that basis. Confirm the exact target model.
- **Concurrent SCStreams are undocumented** (unverified); forum reports of all streams stopping under concurrency exist. T2 is a real go/no-go item.
- **VideoToolbox**: no documented session cap, but `-12908` "encoder busy" has been reported on M1. Set `RequireHardwareAcceleratedVideoEncoder` so a busy engine fails loudly instead of silently falling to software on 8 GB. Use a 1–2 s keyframe interval.

**Capture details**
- SCK system audio (`capturesAudio`, macOS 13+) is the primary path. **Core Audio process taps move to a later phase**: they need `NSAudioCaptureUsageDescription`, fail silently with zero-filled buffers when TCC is missing, and the prompt is unreliable. If the display owning system audio is unplugged, audio stops, so the audio owner must fail over to another stream.
- SCK mic capture is macOS 15+ and has reported corruption, so the mic stays in AVCapture.
- Webcams: separate `AVCaptureSession`s; the limit is USB host-controller bandwidth, not the API. Prefer MJPEG/H.264 camera formats and measure MJPEG decode CPU. Whether the renderer can preview a camera the helper is capturing is **unverified**; if not, the recorder preview must be streamed from the helper (thumbs at higher rate).
- **Screen tracks are variable frame rate** (SCK sends frames on change; drop buffers whose status is not `.complete`). The editor, importer and export must not assume constant fps.
- macOS system camera effects (Reactions, Presenter Overlay) burn into webcam video; we can only detect them.
- Handle display hot-plug, sleep, lid close, lock screen and fast user switching with per-track segment rollover; handle disk-full and swap pressure on 8 GB.

**Clock**
- Do not assume SCK timestamps are host time: convert from `SCStream.synchronizationClock` with `CMSyncConvertTime`.
- USB webcam/mic timestamps hide device latency (tens of ms, unverified). The manifest stores a **per-device sync offset**, editable in the editor and calibrated by a clap/flash measurement.

**Crash-safe files**
- `movieFragmentInterval` recovery is weakly documented and reportedly works only for QuickTime (`.mov`), not MPEG-4. Use **`.mov` fragments or the HLS/CMAF segment delegate** (`outputFileTypeProfile`, `didOutputSegmentData`, fsync each segment; CMAF crashes unless `expectsMediaDataInRealTime` is true). CAF crash survival depends on the unknown data size staying -1 until close: unverified, tested in T7. Chosen container is an output of the PoC, not an assumption.

**Packaging and TCC (hypotheses, gated by §2e G-SIGN / G-TCC — not decisions)**
- `build/entitlements.mac.inherit.plist` has no `device.camera` / `device.audio-input` [V]. The helper must be signed with **its own entitlements** (camera, audio-input); electron-builder signs nested code with `entitlementsInherit` by default, so a per-file signing step is needed (electron-builder 26 support unverified; fall back to a post-sign script in `afterPack`).
- Place the helper in `Contents/MacOS` or `Contents/Helpers`, embed an Info.plist (`-sectcreate __TEXT __info_plist`) with its own usage strings. **Do not use a nested `.app` launched through LaunchServices** (it may become its own TCC identity); spawn the executable directly and never with the responsibility-disclaim flag.
- Add real usage strings: `NSScreenCaptureDescription` is not a documented Apple key (unverified), so screen-recording prompts show no purpose string.
- macOS 15+ re-prompts for screen recording monthly; users will mostly run 15 or later, not 14.2. Whether `SCContentSharingPicker` avoids this, or supports multi-display, is unverified. Set `mac.minimumSystemVersion` (currently unset) to 14.2.
- Universal builds conflict with a prebuilt Swift helper in `@electron/universal`; stay **arm64-only**.
- Helper lifecycle: finalize on stdin EOF **and** SIGTERM/SIGHUP, ignore SIGPIPE, heartbeat to detect a frozen parent.

**Rendering**
- The WebGL single-backend claim hides a cost: `<video>` is not frame-accurate, so "same pixels in preview and export" requires either a **WebCodecs preview player** (seek, buffering, A/V sync — budgeted explicitly in P5) or accepting approximate preview timing with a shared shader and scene evaluator. Decision recorded in ADR-0002 after the R-PoC.
- Define **one working color space** (SCK BGRA is sRGB/P3-tagged, HEVC is BT.709, WebGL converts implicitly) or parity tests will fail; tag outputs explicitly.
- Run export in a dedicated worker/window with OffscreenCanvas and `backgroundThrottling:false`; enforce a strict `VideoFrame` close/budget (four decoders on 8 GB). JS demuxers handle edit lists and VFR poorly: the R-PoC tests against real helper output. WebCodecs HEVC encode has been on by default on macOS since Chromium M130 (so present in Electron 43), but always gate on `isConfigSupported`.

**Domain/UI migration**
- Route the UI through operations **one panel at a time** behind a reducer adapter, with property tests (apply op then inverse returns the same document) to avoid a big-bang refactor.

**Added PoC scenarios and criteria (in addition to §4)**
- Throughput: topology M of §2d (T3 for 30 min, T5 for 120 min). Pass: zero dropped frames on display tracks, no `-12908`, no software encode, the §2f memory gates, CPU under ~40% [P]. 60 fps is optional (O1). Fallback ladder: 30 fps → 1× scale → H.264 (F1, F2).
- Crash safety: `kill -9` at 100 random moments per container type; recovered duration ≥ wall time − 2 s; readable by AVFoundation, ffmpeg **and** the JS demuxer.
- TCC on a **clean user, notarized build**, helper spawned from the app, on 14.2, 15 and the latest macOS; expect one grant each for camera, mic and screen under the app name.
- Hot-plug (unplug external display), sleep/resume, 20× pause: files valid, manifest consistent.
- Export spike: the full R-PoC of §2i (R1–R12). 4K60 is informational only.

---

## 2c. Time model (normative — revision item 5)

One unit per layer, one suffix per unit, conversions only at named boundaries. The suffix is part of the field name and is checked by a test (a schema walker fails on any v3 document or MCP field whose name ends in `Us`, `Micros`, `Ns` or `Sec` outside its allowed layer).

| Type | Unit | Allowed in | Field suffix |
|---|---|---|---|
| `Ticks` (branded safe integer) | flick: 1 tick = 1/705,600,000 s | Domain document v3, operations, history, scene evaluator, `AudioMixPlan` | `…Ticks` |
| `HostNs` (decimal string in JSON, `bigint` in code) | nanoseconds of the capture host clock | Capture manifest, helper protocol events only | `…HostNs` |
| `Micros` (integer) | microseconds | **Only** at the WebCodecs boundary (`VideoFrame.timestamp`, `EncodedVideoChunk.timestamp/duration`). Never stored. | `…Micros` |
| `Seconds` (float) | seconds | UI display; legacy v2 documents (read once, at migration); the MCP/agent public API; ffmpeg argv emission; WebAudio scheduling | `…Sec` |
| Rational timebase `{num, den}` | source track timescale | Source probe data (`MediaSource.probe`) | `timebase` |

Facts: 705,600,000 = 2^9·3^2·5^5·7^2, so ticks divide exactly into 24, 25, 30, 48, 50, 60, 24000/1001, 30000/1001 and 60000/1001 fps frame durations and into 44.1/48/96 kHz sample periods. A tick is ~1.417 ns. The JS safe-integer horizon is 2^53 / 705,600,000 ≈ 1.28×10^7 s ≈ **147.7 days** (arithmetic, not measured); the document validator rejects any `Ticks` above 2^53−1 and any non-integer.

**Conversion boundaries (the only places units change), all in `src/shared/time/convert.ts`:**
1. **Helper → importer.** `…HostNs` deltas to `Ticks`: `ticks = round(ns × 0.7056)`, computed with `bigint`, never floats. Offsets are always computed from absolute values (`firstPtsHostNs − anchorHostNs`), never accumulated.
2. **Probe → domain.** ffprobe/AVAsset pts × timebase `{num,den}` to `Ticks` with `bigint` rational math.
3. **Domain → WebCodecs.** `Ticks → Micros = round(ticks / 705.6)`. Always derived from the absolute tick value or from the frame index through the source's rational fps, never by accumulating micros, so no drift can build up.
4. **Domain → frame grid.** `ticksToFrame(ticks, fps)`: `floor` selects "the frame displayed at t" (hold semantics), `round` is used only for snapping edits to frames. Both rules are documented, tested, and the only ones allowed.
5. **Domain ↔ MCP.** The public API takes and returns `…Sec` decimals (max 6 fractional digits). Parse with `round` to the nearest tick; format with exactly 6 decimals.
6. **Domain → ffmpeg argv.** One formatter `toFfmpegSeconds(ticks)` (9 fractional digits). Ticks→decimal is non-terminating (the denominator contains the factors 3 and 7), so this boundary is lossy by ≤ 0.5 ns, far below one frame; no other code may format seconds.
7. **Domain → WebAudio.** `AudioContext.currentTime` seconds are used only inside the preview audio scheduler, converted at that boundary.
8. **v2 → v3 migration.** Float seconds → `Ticks` with `round`. If rounding makes two same-lane clips overlap by one tick, the later clip's start snaps to the earlier clip's end, and the migration records `migratedFrom: 2`.

Property tests: (a) for every v2 value with ≤ 6 decimals, `Sec → Ticks → Sec` returns the same 6-decimal string; (b) `Ticks → Micros → Ticks` error ≤ 354 ticks (0.5 µs); (c) every standard frame rate's frame `n` maps to the exact integer tick `n × ticksPerFrame`; (d) the manifest importer reproduces a synthetic offset to ≤ 1 tick.

---

## 2d. Hardware topology and PoC scope (normative — revision item 7)

**Inventory observed on the working Mac (2026-11-15, read-only `system_profiler`, nothing benchmarked):** MacBookPro17,1 (13" M1), 8 GB, **macOS 26.5.2**; displays: internal "Color LCD" 2560×1600 Retina and external "LG HDR WQHD" 3440×1440; cameras: built-in "Fotocamera HD FaceTime", "Elgato Facecam 4K" (UVC, USB), "Angetube Live Camera" (UVC), plus "OBS Virtual Camera" (a virtual camera extension; **excluded from all tests** except one enumeration check). **Gap:** this machine cannot test macOS 14.2 or 15; see G-TCC in §2e.

### Mandatory topology M (the pass/fail configuration)
| Item | Value |
|---|---|
| Video tracks | **4**: internal display (2560×1600 native pixels, 30 fps), external display (3440×1440 native pixels, 30 fps), built-in camera (1080p30 if supported, else best available), one USB camera (1080p30) |
| Audio tracks | **2**: one microphone (device chosen by explicit ID) and one system-audio track (ScreenCaptureKit) |
| Total tracks | 6 files + manifest |
| Clock | one host clock, one anchor |
| Duration | 30 min (T3), 120 min (T5) |

### Capability classes
| Class | Items | Meaning |
|---|---|---|
| **Mandatory** (failure of every candidate means the native approach fails for that capability) | M1 two displays recorded concurrently; M2 two cameras concurrently; M3 microphone; M4 system audio; M5 shared-clock sync within budget; M6 crash-recoverable files; M7 memory/CPU/disk within §2f budgets | Pass/fail |
| **Optional** (measured and reported, never blocking) | O1 displays at 60 fps; O2 third camera (second USB); O3 second microphone track (3 audio tracks); O4 camera at 4K; O5 Core Audio process tap; O6 HEVC *and* H.264 both measured; O7 external 4K display (**not testable on this Mac**: no 4K display available) | Reported with numbers |
| **Fallbacks** (allowed to satisfy a mandatory item when native fails; each carries a recorded product cost) | F1 H.264 instead of HEVC; F2 display 1× scale or 30 fps; F3 Chromium `getUserMedia` cameras alongside native screen/audio (hybrid; sync is weaker); F4 segmented files instead of one fragmented file; F5 SCK audio in place of the process tap | Pass with annotation |

### Disk-rate calculation (assumptions [P], not measured; replaced by T1 measurements)
Assumptions: display HEVC 10–20 Mbps each; camera 6 Mbps each; audio LPCM 16-bit / 48 kHz / stereo = 48,000 × 16 × 2 = 1.536 Mbps per track, **2 tracks**. 1 MB = 10^6 bytes.

| Component | Count | Mbps each | Mbps total |
|---|---|---|---|
| Display video | 2 | 10–20 | 20.0–40.0 |
| Camera video | 2 | 6 | 12.0 |
| LPCM audio | 2 | 1.536 | 3.072 |
| **Total** | | | **35.07–55.07** |

→ 4.38–6.88 MB/s → **263–413 MB/min** → 15.8–24.8 GB/h. T3 (30 min): 7.9–12.4 GB. T5 (120 min): 31.6–49.6 GB. Float32 LPCM would add 3.07 Mbps (+23 MB/min). The earlier draft's "3 LPCM tracks, 37–57 Mbps, 280–430 MB/min" is **withdrawn** (it assumed a third audio track that M does not contain). Required free space on the recording volume for T5: ≥ 2× the recording (recovery copies) ≈ 100 GB [P]; the audit measured only 3.5 GiB free on the current volume, so an external SSD is a P1 prerequisite.

### Test scenarios (replace the earlier T1–T5 rows; T6–T11 unchanged)
| ID | Scenario | Purpose |
|---|---|---|
| T1 | Internal display only, native pixels, 30 fps, HEVC, 10 min | Single-source baseline; **first real disk-rate measurement** |
| T2 | Both displays @30 + microphone + system audio, 30 min | M1, M3, M4 |
| T3 | **Topology M** (T2 + two cameras), 30 min | **Full mandatory load** |
| T4 | Topology M with displays @60 fps (O1), 10 min | Encoder headroom, reported not blocking |
| T5 | Topology M, 120 min | Memory slope, drift, thermal, disk |

---

## 2e. Experimental gates — capture permissions and helper signing (normative — revision item 8)

Neither TCC attribution nor per-binary signing is assumed. Statements about them elsewhere in this document (including §2b "Packaging and TCC") are **hypotheses** until these gates pass. Both gates run in P1, before any integration work (P4).

### G-SIGN — can the helper be signed with its own entitlements and still capture?
- **Question:** can a nested capture helper carry its *own* entitlements (`device.camera`, `device.audio-input`, no `allow-jit`, no `disable-library-validation`) and Info.plist (usage strings), be Developer-ID signed with hardened runtime, be notarized as part of the app, and still capture camera and microphone?
- **Candidate methods (all unverified):** (A) electron-builder 26 per-file signing options; (B) custom `afterPack`/`afterSign` `codesign` of the helper before the app bundle is sealed; (C) sign the helper manually first and let electron-builder sign the rest with `entitlementsInherit`.
- **Observations:** `codesign -dvvv --entitlements :- <helper>`; `codesign --verify --deep --strict` on the app; `spctl --assess`; notarization acceptance; `stapler validate`; launching under hardened runtime; capture of camera and microphone from the signed helper.
- **Pass:** the helper shows its own entitlements and identifier; notarization accepted; camera + microphone capture succeed; the app still verifies after packaging; the process is repeatable from a clean checkout in CI.
- **Fail ladder:** another method (A→B→C) → helper as a nested helper `.app` (G-TCC layout L3) → in-process native addon (ADR-2 is then reopened) → Chromium capture for the affected capabilities.

### G-TCC — which layout makes grants attribute to the app identity?
- **Question:** for Screen & System Audio Recording, Camera and Microphone (and Audio Capture only if process taps are used), which helper layout and launch context yields exactly one entry per permission, named after the app, prompted once and persistent?
- **Matrix (all cells run, none assumed):** layouts L1 helper in `Contents/MacOS` spawned directly by Electron main; L2 in `Contents/Helpers`; L3 nested helper `.app`, inner binary spawned directly; L4 nested helper `.app` launched through LaunchServices (negative control). Launch contexts: Finder/Dock launch; `open`; launched from Terminal (negative control); dev `electron .` (negative control). Initial state: fresh user account; previously granted; revoked via `tccutil reset`. Also: the monthly re-prompt on macOS 15+, app update/re-sign continuity (same Team ID and designated requirement), and helper restart.
- **Observations:** the entry that appears in System Settings and its name; prompt text and where the usage string comes from; whether the helper receives real buffers or zero-filled ones after a denial; `PERMISSION_DENIED` event latency after revocation.
- **Pass:** one entry per permission under the app's name; capture works; survives app relaunch and helper restart; revocation is detected and reported within 2 s [P].
- **Fail ladder:** (1) request permissions from the Electron main process, capture in the helper — valid only if the grant transfers, which is tested; (2) helper `.app` with its own identity and its own onboarding; (3) in-process native addon (ADR-2 reopened); (4) Chromium capture for the affected capabilities.
- **OS coverage requirement:** the working Mac runs macOS 26.5.2. G-TCC must also run on **14.2 and 15** on real hardware or separate boot volumes (VMs lack camera and TCC fidelity). If macOS 14.2 hardware cannot be obtained, the supported minimum is raised to the lowest version actually tested; "14.2+" is not claimed without a run. The decision is made in the first week of P1.

---

## 2f. Memory model and budgets (normative — revision item 4)

### Metrics, and what each one does *not* tell you
| Metric | Source | Includes | Misleading because | Use |
|---|---|---|---|---|
| **RSS** | `ps -o rss`, Activity Monitor "Real Mem" | Resident pages incl. shared libraries and file-backed pages | Double-counts shared pages across processes; excludes compressed memory; not additive | Diagnostic only; **never a pass metric** |
| **Physical footprint** | `footprint <pid>`, `phys_footprint` | Dirty + compressed + graphics/IOSurface memory attributed to the process | Attribution of shared IOSurfaces to one owner is approximate | **Primary per-process budget metric** |
| **Shared GPU / IOSurface** | `vmmap --summary` regions (IOSurface, IOAccelerator, VM_ALLOCATE) | Buffers shared between helper, GPU process and renderer (SCK frames, VideoToolbox, WebGL textures). Apple silicon has unified memory, so these *are* system RAM | May appear in several processes' maps | Reported as its **own line**, counted once |
| **System state** | `memory_pressure`, `vm_stat`, `sysctl vm.swapusage` | Whole-machine pressure level, compressor and swap activity | Not per-process | **Gate metrics**: pressure level and swap delta |

### Budgets (all [P], calibrated against the original baseline of §2j; none measured)
**Level 1 — per process, physical footprint, steady state p95 after a 5 min warm-up:**
| Process | Recording (native) | Editing, 60-min 4-source project | Export |
|---|---|---|---|
| `ovc-capture` helper (incl. owned IOSurfaces) | ≤ 350 MB | — | — |
| Electron main | ≤ 250 MB | ≤ 250 MB | ≤ 250 MB |
| Recorder renderer | ≤ 250 MB | — | — |
| Editor renderer | — | ≤ 700 MB | — |
| Export renderer + GPU process (combined) | — | — | ≤ 1.5 GB |
| GPU process | ≤ 300 MB | ≤ 400 MB | (in the combined line) |
| Other children (utility, ffmpeg) | ≤ 100 MB | ≤ 200 MB | ≤ 300 MB |

**Level 2 — whole application** (sum of footprints over the full process tree: Electron processes + helper + ffmpeg children; shared IOSurface bytes reported separately and counted once): recording ≤ **2.0 GB**; editing idle ≤ **2.0 GB**; editing playback ≤ **2.5 GB**; export ≤ **3.0 GB**. The 8 GB machine also runs macOS and other apps, so these budgets deliberately leave ≥ 2 GB headroom (the macOS baseline load is not measured here).

**Level 3 — system gates:** `memory_pressure` stays at *normal* during T3, T5 and export; swap used grows by ≤ 100 MB over the run; no jetsam kill and no crash report.

**Growth:** footprint slope after warm-up ≤ 5 MB per 10 min per process (leak detector), 120 min run included.

### Measurement protocol
Sample every process in the tree at 1 Hz with `footprint` and `ps` (RSS for diagnosis), `vmmap --summary` every 30 s (heavy, so not 1 Hz), `memory_pressure` / `vm_stat` / `vm.swapusage` every 5 s. Report p50 / p95 / max and the slope. The sampler's own footprint and CPU are measured and subtracted or reported. Every result states which metric it is; a result that cites only RSS is rejected by the comparison script.

---

## 2g. Multi-camera capture (normative — revision item 2)

**Verified (Apple documentation JSON, fetched 2026-11-15):** `AVCaptureMultiCamSession` lists iOS 13.0+, iPadOS 13.0+, **Mac Catalyst 14.0+**, tvOS 17.0+, visionOS 2.1+. **macOS is not listed.** The earlier draft's "iOS-only" was imprecise: the correct statement is "not listed for macOS; listed for Mac Catalyst, with unverified behavior on Mac hardware."

**Candidates. None is assumed to work on the target Mac; each is tested.**
| ID | Approach | Prior | What must be tested |
|---|---|---|---|
| C1 | N independent `AVCaptureSession`s (one device input and one video data output each) | Leading candidate (common practice) [H] | Concurrency of built-in + USB; frame-rate stability; dropped frames; CPU; time-to-start; hot-unplug isolation |
| C2 | One `AVCaptureSession` with several video `AVCaptureDeviceInput`s | Unknown on macOS | Whether `canAddInput` accepts a second video device; per-input connections |
| C3 | `AVCaptureMultiCamSession` in a Mac Catalyst build | Unknown; low prior (Catalyst packaging for a headless helper) | `isMultiCamSupported` on this Mac; which format pairs are allowed |
| C4 | CoreMediaIO device streams (`CMIO*` APIs) | Low-level, rarely used for capture | Only if C1 fails for specific devices; lifecycle and format control |
| C5 | One helper *process instance* per camera (same binary, `--role camera`) | Process isolation if C1 shows cross-camera interference | Interference between sessions in one process; supervision cost |
| C6 | Chromium `getUserMedia` + MediaRecorder for cameras (the existing path), native for the rest | Known to run today [V]; sync is weaker | Cross-engine sync error against the host clock |
| — | Excluded: direct UVC/IOKit isochronous access (reimplements a driver), DAL plug-ins (deprecated, provider side), Camera Extensions (provider side; they produce virtual cameras, they do not consume cameras) | | |

**Test matrix (P1, on the devices present):** pairs and the trio of {FaceTime, Elgato Facecam 4K, Angetube} at 720p30 and 1080p30; formats chosen explicitly (NV12 / 420v versus MJPEG versus YUY2); USB topology recorded with `system_profiler SPUSBDataType` (same hub or controller versus separate ports); each candidate run 30 min. Measure per-camera frame rate and dropped frames, helper CPU, thermal state, time-to-start, hot-unplug isolation, and whether the **renderer can preview a camera the helper is capturing** (the format can change when a second client opens the device). The OBS virtual camera is enumerated once to confirm virtual devices are listed and excluded by default.

**Decision rule:** M2 (two cameras) passes if any candidate sustains built-in + one USB for 30 min with dropped frames ≤ 0.1% per track. Optional O2 (third camera) is reported only. If no native candidate meets M2, the fallback is C6 (hybrid), and the cost (weaker sync) is recorded. A failure of one USB device or pair is a device-compatibility note, not a kill.

---

## 2h. MCP headless behavior and document authority (normative — revision item 6)

**Contradiction resolved.** The earlier draft had an app-owned socket *and* headless proposals written to `.ovc/proposals/` by clients. That implied a second implementation of validation and apply outside the app. It is removed.

**Rule: one implementation, one authority.**
- **One implementation:** the TypeScript package `src/shared/editor-domain` is the only code that validates, applies, previews, commits and undoes operations. The Swift `mcp-bridge` relays bytes and contains **no domain logic**.
- **One authority (decision conditional on P3.9):** a `DocumentService` in the Electron **main** process owns the authoritative document per open project and is the only writer of `editor.json`. The renderer keeps an optimistic **replica**: gestures update the replica at 60 fps (transient state, never persisted), and on gesture end commit as operations over IPC. Main validates, applies, persists and returns patches; a rejection rolls the replica back. The same package runs in both places (renderer optimistically, main authoritatively).
- **App running:** every tool goes through the socket to the DocumentService.
- **App not running:** there is **no offline read path and no offline mutation path**, because either would need a second implementation (the bridge is Swift and cannot call the TS parser). The bridge returns `APP_NOT_RUNNING` with an instruction, or — only if the user enabled `ai.allowBackgroundLaunch` (default **off**) — launches the app in the background (no windows, no Dock presence) and waits for the socket. Whether a background launch is clean on macOS (no focus steal, single-instance lock respected, acceptable start time and memory) is **unverified** and tested in P9.
- **Proposals:** created and held by the DocumentService. They are persisted to `.ovc/proposals/` **by the app only**, so they survive an app restart through the same code path. No client writes that directory.
- **Approvals:** always require user presence in the app. If the app was launched headless and a tool needs approval, the app surfaces a window or notification, and the tool returns `APPROVAL_REQUIRED` until the user acts.
- **Gemini agent:** calls the DocumentService in-process (no socket).
- **Transition:** until P9 flips `ai.gateway=on`, the legacy MCP server keeps writing `editor.json` through the existing revision CAS plus lock file. When the flag is on, the legacy write tools refuse. Both paths never run at once.
- **Behavior change to document:** `ovc://projects` and other read resources no longer work without the app. This is intentional and noted in the MCP docs.

---

## 2i. Rendering spike R-PoC (normative — revision item 3)

**Definition of "1.0× realtime".** Export speed factor = *output media duration* ÷ *wall-clock time* from the export request until the finalized, verified file exists on disk, including demux, decode, composite, encode, audio mix, mux and file finalization, excluding any save dialog time. 1.0× means a 10-minute timeline exports in ≤ 10 minutes; 2.0× means ≤ 5 minutes. Reported as the median of 3 runs, each ≥ 5 minutes of output so thermal effects appear; AC power; no other foreground apps; thermal state recorded at start; cold run (first after reboot) and warm run reported separately. Alongside it: sustained fps and p95 per-frame time.

**Test scenes (synthetic sources generated with ffmpeg `lavfi`, so the spike does not depend on capture hardware):** S1 single 1080p clip drawn and re-encoded; S2 two layers (2560×1600 screen scaled into a 1920×1080 canvas, plus a circular-masked 1080p camera with border and shadow) + background + one text layer + one crossfade; S3 = S2 + animated zoom keyframes + karaoke subtitles. Inputs include H.264 and HEVC, CFR and VFR, one with edit lists and B-frame reordering, and a 60 fps variant.

| ID | Test | Pass / fail threshold [P] |
|---|---|---|
| R1 | **Deterministic seeking.** 200 random target times, each reached cold and after other seeks, in the WebCodecs player | 0 frame-identity mismatches against the ffprobe frame table; 100% identical pixel hashes across repeats; seek latency p95 ≤ 150 ms at 1080p (GOP ≤ 2 s) |
| R2 | **Frame stepping.** ±1 over 500 consecutive frames incl. GOP boundaries, VFR gaps and edit lists, forward and backward | Exact monotonic index sequence, 0 skipped or duplicated frames; step latency p95 ≤ 100 ms |
| R3 | **VFR inputs.** Gaps up to 5 s, mixed VFR+CFR, negative start times, B-frame reorder; export to CFR 30 and 60 | Each output frame uses the latest source frame with PTS ≤ t (hold); A/V offset ≤ 1 frame (flash + beep); the JS demuxer's timestamps equal ffprobe's on 20 files |
| R4 | **Color.** Tagged BT.709 limited, Display-P3/sRGB full-range BGRA, BT.601 MJPEG, untagged; test patterns (bars, gray ramp, saturated primaries) | Working space fixed to **SDR BT.709 / sRGB display-referred** and recorded in ADR-0002; ΔE2000 ≤ 2 average and ≤ 5 max against a reference for in-gamut content; output `colr` atom written; export re-decoded by Chromium, ffmpeg and QuickTime matches preview within the same tolerance. HDR inputs are detected and refused or tone-mapped (decision recorded), never silently mis-rendered |
| R5 | **Bounded VideoFrame and decoder memory.** 4 sources, S3, 10 min, plus an artificially slow encoder to force back-pressure | Every `VideoFrame` closed within 2 render ticks (instrumented create/close counter, 0 leaks); frames alive ≤ 6 per source and ≤ 24 total; `decodeQueueSize` and `encodeQueueSize` bounded (≤ 8 and ≤ 4); footprint plateaus (§2f slope rule) |
| R6 | **Actual hardware acceleration**, not just support | Required evidence chain: (1) `isConfigSupported` true with `hardwareAcceleration: "prefer-hardware"` for decode and encode at 1080p; (2) the same export with `prefer-software` versus `prefer-hardware` shows ≥ 30% lower process CPU and lower power (`powermetrics`, run by the user with sudo); (3) at least one OS-level confirmation (Instruments VideoToolbox template or unified log showing a hardware session) and a `chrome://gpu` / `app.getGPUFeatureStatus()` snapshot. `isConfigSupported` alone is **not** accepted |
| R7 | **1080p30 export**, S1/S2/S3 | **Mandatory:** S2 ≥ **1.0×** realtime. Target ≥ 1.5×. S3 ≥ 1.0× or an explanation recorded |
| R8 | **1080p60 export**, S2 with 60 fps sources | **Conditional claim:** ≥ 1.0× → 60 fps export is supported; 0.5×–1.0× → supported but labeled "slower than realtime"; < 0.5× → export is limited to 30 fps (or the native fallback is used for 60). Not a kill criterion for the architecture |
| R9 | **Preview player** (WebCodecs, 720p proxies, 2 layers, 5 min) | Dropped preview frames ≤ 1%; A/V sync within ±40 ms; scrub within R1 latency. If it fails, preview falls back to `<video>` with shared shaders (frame-exact only when paused) |
| R10 | **Preview ≡ export parity** at 10 timestamps found by frame stepping | SSIM ≥ 0.999 and max abs diff ≤ 2/255 on 99.9% of pixels, same GPU, same decoder path |
| R11 | 4K60 export | Informational only; not pass/fail |
| R12 | Native fallback viability (AVFoundation + custom Metal/Core Image compositor inside the helper) | Run **only** if a hard kill below fires |

**Whole-run memory:** the export group and whole application stay inside the §2f budgets. **Hard kill → switch to the native fallback:** R1 or R2 non-deterministic; R6 hardware encode not confirmed; R7 < 1.0×; R5 unbounded growth or budget exceeded; R3 demux incorrect with no fix within 3 working days. **Conditional (downgrade, not kill):** R4 mismatch (fix in shader), R8 (limit 60 fps), R9 (approximate-timing preview).

---

## 2j. Baseline ordering (normative — revision item 1)

The untouched repository at `143a0d6` is measured **first**, in an isolated detached worktree, with **external tooling only**, before any dependency, identity, feature or code change. That original baseline is preserved separately and immutably from the post-hardening baseline. The step-by-step order is in §9 P0 (P0a original → P0b hardening → P0c post-hardening).

---

## 3. Target architecture

```
┌──────────────── Electron app (arm64, hardened) ────────────────────────────────────┐
│ Renderer: Editor UI (React)  ──dispatch ops──►  Domain store (editor-domain v3)     │
│   ├─ Preview: scene evaluator ─► WebGL2 compositor ◄─ <video>/VideoFrame sources    │
│   └─ Recorder UI (levels, thumbs, device state)                                      │
│ Hidden Render process: scene evaluator ─► compositor ─► WebCodecs encode ─► mux     │
│ Main: IPC gateway (schema + sender allowlist) · ProjectStore · ProcessSupervisor    │
│   ├─ CaptureEngine{native|chromium}  ──stdio JSONL v1──►  ovc-capture (Swift)       │
│   ├─ Media toolbox (ffmpeg: probe, remux, proxies, peaks, audio mix, mux)           │
│   ├─ Recovery service (launch scan, manifest + fragment repair)                     │
│   └─ AI gateway (UDS + token) ◄── mcp-bridge (helper) / Gemini agent      │
└─────────────────────────────────────────────────────────────────────────────────────┘
ovc-capture: SCStream×N displays (+SCK system audio | process tap) · AVCaptureSession×M cams/mics
             · host-clock stamping · AVAssetWriter(VideoToolbox HEVC/H.264, fragmented) · CAF LPCM
             · capture-session.json manifest · writes only inside sessionDir
```

---

## 4. Native capture Proof of Concept (mandatory gate before Phase 2)

- **Scope:** a standalone SwiftPM package `native/capture-poc/` with CLI `ovc-capture-poc`. It has no Electron, no UI beyond the CLI, and does not touch app code.
- **Interface:**
  - `ovc-capture-poc list`
  - `ovc-capture-poc record --display all --camera <id>,<id> --mic <id> --system-audio sck|tap --codec hevc|h264 --fps 30|60 --duration 600 --out <dir> [--pause-at 120:10]`
  - stdout emits the same JSONL events as protocol v1 (dry-run of the protocol).
- **Architecture:** each source runs on its own serial capture queue, feeding a per-track writer actor. There is a shared host-clock anchor, a 1 Hz stats sampler, and atomic manifest rewrites.
- **Permissions:** Screen & System Audio Recording, Camera, Microphone (+ Audio Capture for the process-tap variant). Usage strings live in the PoC's Info.plist. A run from Terminal attributes TCC to Terminal, so the PoC is **also run as a signed bundled helper inside a minimal host `.app`** to observe real attribution (test T-perm).

### Test scenarios (on the target M1 8 GB, macOS 14.x and 15.x)

| ID | Scenario | Purpose |
|---|---|---|
| T1–T5 | Defined in §2d (topology M: 2 displays + 2 cameras + 1 microphone + system audio = 4 video and 2 audio tracks; T3 = 30 min, T5 = 120 min) | See §2d |
| T6 | Sync clapper: full-screen flash + beep through speakers, cameras aimed at screen | Offset & drift measurement (all tracks see or hear the same event) |
| T7 | `kill -9` at random times during T3 (×20) | Crash recoverability |
| T8 | Unplug a webcam / mic / external display mid-T3 | Device loss: others continue, typed event |
| T9 | Pause/resume ×10 during T3 | Sync preserved across pauses |
| T10 | Disk nearly full (sparse image volume) | `DISK_FULL` handling, finalize what exists |
| T11 | Sleep/wake during recording | Re-anchor, no corrupt files |
| T-perm | Gates G-SIGN and G-TCC of §2e (layout × launch-context × OS matrix) | TCC attribution, usage strings, signing |

### Measurements & tools
- **Memory:** RSS/footprint per process at 1 Hz (`footprint`, `ps`, `vmmap --summary`).
- **CPU:** CPU% per process.
- **Power and thermal:** CPU/GPU/ANE power and thermal pressure (`sudo powermetrics --samplers cpu_power,gpu_power,thermal`).
- **Disk:** bytes/s (`iostat`, helper `stats`).
- **Frames:** frames written vs expected (from timestamps), dropped frames per track.
- **Encoder:** encoder latency and queue depth.
- **Sync:** start offset and drift from T6, using an ffmpeg-based analyzer (flash luminance onset per video track, beep onset per audio track).
- **Recovery:** post-kill playable duration vs kill time.

### Expected artifacts
- `bench/poc/<date>/` holding the raw CSVs, manifests, `ffprobe` JSON of every file, sync analysis report and system info.
- A PoC report `docs/adr/0001-native-capture.md` with **measured** numbers and a go/no-go decision.

### Acceptance criteria [P] — **go** only if all hold on M1 8 GB
- T3 (topology M) runs 30 min with dropped frames ≤ 0.1% per video track and zero audio discontinuities.
- Helper **physical footprint** ≤ 350 MB and slope ≤ 5 MB per 10 min after the first 5 min in T5; whole-app and system gates per §2f (RSS is never a pass metric).
- Start offset between any two tracks ≤ ±1 video frame (33 ms) after offset correction. Drift ≤ 20 ms over 60 min, after correction if a correction method is applied (the ITU-R BT.1359 detectability window is +45/−125 ms; the target is tighter).
- T7: ≥ 19/20 kills leave every track playable up to ≤ 2 s before the kill, with the manifest recoverable.
- T8: the lost device emits `device.lost` and the other tracks keep recording.
- T9: no cumulative offset after 10 pauses (≤ 1 frame).
- G-SIGN and G-TCC (§2e) pass. Neither signing nor TCC attribution is assumed.

### Failure conditions → mitigations to try (bounded to 2 iterations)
- **Encoder saturation (T3/T4):** lower display fps to 30, H.264 for cameras, use the encoder's quality knobs, reduce the display scale for the second display.
- **Webcam concurrency failure:** test single-session multi-input; document per-device limits.
- **SCK audio drift:** switch to the process tap.

### Kill criteria (stop native for that capability; keep the Chromium path for it)
- T3 cannot meet dropped-frame **and** memory budgets after the mitigations.
- Two simultaneous webcams cannot run on M1 with common UVC devices.
- TCC cannot be attributed to the app identity in a shippable layout.
- Fragmented writing is not recoverable and no alternative (segmented files every N s) meets T7.

A partial kill is allowed. Example: native displays and audio with Chromium webcams, when only webcam concurrency fails.

---

## 5. Performance strategy

**Principle:** measure first. Phase 0a measures the **untouched repository at `143a0d6`** (MediaRecorder capture, ffmpeg export) on the M1 8 GB, before anything is changed; that *original baseline* is immutable. Phase 0c measures again after hardening (the *post-hardening baseline*). Every later phase reports against **both**, and a number is only ever compared with a number measured the same way (§2f, §2j).

### Harness (Phase 0)
- **Tier 1 (P0a, original repository): external-only.** Scripts live **outside** the baseline worktree (`~/ovc-bench-tools/`) and never modify, flag or inject into the app. They launch the app, sample the whole process tree (`ps`, `footprint`, `vmmap --summary`, `memory_pressure`, `vm_stat`, `iostat`, and `powermetrics`, which needs sudo and is run by the user), and time scenarios from outside. Scenario actions are manual or UI-scripted.
- **Tier 2 (P0c onward, in the repository):** `scripts/bench/` launches the app with `--bench <scenario>` (scripted actions through a bench IPC channel enabled only in bench builds), adds helper `stats` and `os_signpost` / `performance.mark` timings, and writes `bench/results/<scenario>/<date>.json`. It is **cross-validated against Tier 1** on at least one scenario (agree within 5% [P]) before it is used for regression gating.
- `scripts/bench/compare.mjs` diffs results against **both** stored baselines with thresholds, and rejects a result that cites only RSS (§2f).

### Scenarios and proposed budgets (all [P], calibrated after the P0 baseline; none measured)

| Scenario | Metrics | Proposed budget |
|---|---|---|
| B0 Idle: app launched, home screen, 5 min | Whole-app and per-process physical footprint (§2f), CPU | ≤ original-baseline footprint −20% [P], CPU ≈ 0% when idle |
| B1 Cold/warm start to interactive | ms | warm ≤ 2 s |
| B2 Record 1 display @30, 10 min | Footprint, CPU, dropped, disk MB/s | Native ≤ 50% of MediaRecorder baseline CPU |
| B3 Record topology M (T3, §2d), 30 min | Same + sync offset/drift, thermal | PoC acceptance values; no `serious` thermal pressure |
| B4 Record 120 min | Growth, drift, file integrity | Growth ≤ 5%/h after warmup |
| B5 Open 60-min, 4-source project | Time to first frame, RSS | First frame ≤ 1.5 s with proxies |
| B6 Scrub/seek latency, playback | p50/p95 seek ms, dropped preview frames | p95 seek ≤ 150 ms; 30 fps with 2 video layers on 720p proxies |
| B7 Export 10 min, 1080p30, layout + camera + text + transitions | × realtime (definition in §2i), peak physical footprint (§2f), CPU/GPU | ≥ 1.0× realtime; export group ≤ 1.5 GB, whole app ≤ 3.0 GB |
| B8 Transcribe 60 min audio | Peak physical footprint (§2f), duration | Peak ≤ 1 GB; model unloaded afterwards |
| B9 Thumbnails/waveforms for 60 min source | Time, cache size | Background, bounded cache (LRU, size-capped) |

### Disk-rate arithmetic for B3 [S] (corrected; full table in §2d)
- Topology M: 2 displays HEVC at 10–20 Mbps each, 2 cameras at 6 Mbps each, **2** LPCM 16-bit / 48 kHz stereo tracks at 1.536 Mbps each.
- Total ≈ 35.07–55.07 Mbps ≈ **4.38–6.88 MB/s ≈ 263–413 MB/min** (the earlier 37–57 Mbps figure assumed a third audio track and is withdrawn).
- A disk-space guard is therefore mandatory: refuse to start below a threshold, and warn or auto-stop at N minutes remaining.

### Memory techniques (applied where measurement shows need)
- **Capture:** IOSurface zero-copy into VideoToolbox; small SCK `queueDepth`; bounded writer queues with drop-and-count instead of growth.
- **Editing:**
  - **720p H.264 proxies** generated in the background.
  - ffmpeg-generated **audio peaks** files replace the PRNG waveform [V `BezierAudioWaveform.tsx:25-27`].
  - Sprite-sheet thumbnails with **LRU byte-capped caches**.
  - Never `arrayBuffer()` a whole file in the renderer (fixes H4).
  - Streamed PCM windows for analysis.
  - One quantized Whisper, disposed after use (fixes H5).
- **Background work:** a background task queue at low QoS, paused during recording and export, that reacts to memory-pressure events (`app.on('…')` / helper `DispatchSource.makeMemoryPressureSource`).

---

## 6. Testing & quality strategy

The existing suite (78 files, ~367 cases [V inventory]) is **preserved** as the regression net. Its pass state is unknown until Phase 0 runs it.

| Layer | Tooling | Runs where | First priorities |
|---|---|---|---|
| Domain unit | Vitest (existing) | CI every push | Every op kind: validate + apply + inverse (undo) + ripple; migration fixtures v1→v2→v3; schema/TS drift test (Zod ⇔ TS types, fixes drift [V]) |
| Scene evaluator | Vitest, pure | CI | Golden `RenderScene` JSON for layout presets, zoom chains, speed, transitions, keyframes |
| Native Swift | Swift Testing/XCTest in SwiftPM | CI macOS runner (no TCC needed) | Clock math, pause offsetting, manifest atomicity, protocol codec, writer with **synthetic CMSampleBuffers** |
| IPC contract | Shared JSON fixtures in `native/protocol/fixtures/` | CI (TS + Swift) | Both sides accept and reject the same fixtures; version negotiation |
| Main integration | Vitest + a **fake helper** (Node script speaking protocol v1) | CI | Supervisor lifecycle, heartbeat timeout, crash → recovery, session import with offsets |
| IPC gateway | Vitest | CI | Each channel: schema reject, sender reject, happy path |
| FFmpeg/media | Vitest + pinned ffmpeg (existing pattern) | CI | Proxies, peaks, audio-mix compile, mux, 60 fps preserved, source dims truthful, limiter bounds |
| Compositor parity | Playwright `_electron` (new dependency, Phase 5) rendering fixed inputs; image diff (SSIM/PSNR thresholds) | CI (software GL) + hardware nightly | Same `RenderScene` → preview frame vs export frame within tolerance; regression goldens |
| E2E | Playwright `_electron` | CI smoke; full on hardware | Create → record (fake helper) → edit → export; AI proposal approve/deny |
| Hardware | `swift test --filter Hardware`, bench scenarios | **Dedicated M1 8 GB machine** as a self-hosted runner (label `m1-8gb`), TCC granted once manually; nightly + pre-release | PoC T1–T11 reduced set, B2/B3/B7 |
| Performance regression | `scripts/bench/compare.mjs` | Hardware runner | Fail on > 10% regression vs stored baseline [P] |
| Crash recovery | Fake helper killed at random points (CI); real helper `kill -9` (hardware) | Both | Projects never left in `recording` after relaunch; files playable |
| MCP | Move `test-mcp-smoke.mjs` into Vitest; contract tests per tool | CI | Proposal lifecycle, errors, idempotency, scope |

**Coverage by risk, not percentages:**
- Every domain op, migration, IPC channel, protocol message and MCP tool has at least one reject test and one accept test.
- Every recovery path has a kill test.
- Every visual feature has a parity golden.

GitHub-hosted macOS runners are VMs without cameras or TCC grants, so hardware tests never run there. CI uses synthetic and fake sources.

---

## 7. Security, reliability, distribution

**Electron:**
- `sandbox: true` where feasible (currently not explicit [V `main.ts:292`]).
- Fuses: `runAsNode:false` (after the helper `mcp-bridge`; leaving it on lets any local process borrow the app's camera/mic grants, so this is a security fix, not cosmetic), `enableCookieEncryption`, `grantFileProtocolExtraPrivileges:false`.
- Gate `VITE_DEV_SERVER_URL` on `!app.isPackaged` (M18).
- Media protocols echo the app origin instead of `*` (M17).

**IPC:** a `registerHandler(channel, zodSchema, handler, {allowedWindows})` gateway replaces inline handlers. It validates the payload and checks `event.senderFrame.url` origin plus the window identity against an allowlist (fixes M4). Migration is incremental, channel by channel, with a test each.

**Filesystem containment:** keep `project-containment.ts`. The helper is confined to `sessionDir` (realpath check). AI never receives raw paths. Imports go through a main-side picker or consent grant (fixes M5 correctly).

**Native helper:**
- Minimal entitlements (camera, audio-input).
- No network.
- Validates every request.
- Runs only when spawned by the app (checks parent PID / inherited pipe, rejects unknown `sessionToken`).

**Media integrity:**
- Fragmented writes + manifest. Exports go to `.part` then rename, with `-nostdin` (M6).
- Atomic JSON writes (exist [V]).
- Throttled `project.json` writes (M8).
- `powerSaveBlocker` while recording or exporting (M9).

**Crash recovery service:** at launch, scan for projects in `recording`/`processing` or sessions with an unfinalized manifest. Then repair (fragment recovery or remux), probe, import with offsets, and mark `recovered` with a user-visible notice.

**Updates & identity:**
- New appId, productName, `publish` → the fork repo, the fork's Team ID in `verify-mac-release.mjs` and `release.yml`.
- `autoDownload` off until the feed is live.
- Never point at upstream's feed (H14).

**Signing/notarization:** reuse `check-mac-signing.mjs` / `verify-mac-release.mjs` and extend the verification to the helper binary (Developer ID + Team ID + hardened runtime). Build arm64-only.

**Dependencies:**
- Bump Electron (≥ 43.8.1 or current), zod and the MCP SDK (H13).
- `npm audit` in CI, SHA-pinned actions, scoped release permissions, Dependabot (M14).
- Generated third-party license report.

**DMG vs future MAS:**
- MAS would need the app sandbox, which constrains the helper (it must be sandboxed and inherit), plus no GPL ffmpeg and no `disable-library-validation`.
- Keep MAS out of scope. Don't delete the MAS config until a decision is made; stop maintaining it.

**Legal questions for specialist review (no conclusions drawn here):**
1. GPLv3 obligations when shipping a GPL ffmpeg binary as a separate executable inside an app with a different license: aggregation vs combined work, source-offer form.
2. H.264/HEVC patent licensing exposure: bundled x264/x265 vs system VideoToolbox encoders.
3. Whisper model and weights licenses, plus redistribution if bundled.
4. Font licenses for bundled overlay fonts used in exports.
5. Privacy and consent obligations for uploading user recordings to Gemini or cloud STT (M2), and data retention/deletion.
6. Fork naming and trademark relative to upstream "Open Video Craft".

---

## 8. MCP & AI architecture (detail)

**Tool surface (typed, each compiling to domain operations):**

| Group | Tools |
|---|---|
| Inspect | `get_project`, `get_timeline{rangeSec?}`, `list_sources`, `get_source{id}`, `get_transcript{rangeSec?}`, `get_history` |
| Analysis (jobs) | `start_analysis{kinds: silence\|transcript\|filler\|scene_change\|loudness\|cursor_activity}`, `get_job`, `cancel_job` |
| Proposals | `create_proposal{baseRevision, summary}`, `add_operations{proposalId, ops[], clientRequestId}`, `preview_proposal{proposalId}` → diff + frame resources, `commit_proposal{proposalId}`, `discard_proposal` |
| Editing helpers (compile to ops inside a proposal) | `tracks.*`, `clips.split/trim/move/delete/set_speed`, `transitions.*`, `effects.*` (zoom/keyframes), `overlays.*` (text/card/image), `subtitles.generate/style/edit`, `audio.set_gain/fade/apply_processing/normalize`, `templates.list/apply` |
| Preview | `render_frame{tSec, scale}` → image resource; `render_clip{rangeSec, lowRes}` (job) |
| Export | `prepare_export{settings}` → estimate + validation; `start_export{prepared}` (**requires user approval**) → job; `cancel_job` |
| History | `undo_transaction{transactionId}` (agent transactions only, if still the latest or non-conflicting) |

**Rules:**
- **Validation:** one Zod schema generated from, or checked against, the domain TS types. A drift test is mandatory.
- **Transactions:**
  - Proposals are sandbox copies at `baseRevision`.
  - Commit rebases only if no conflicting revision exists; otherwise it returns `REVISION_CONFLICT` with the new revision.
  - Each commit is one undo entry.
- **Idempotency:** `clientRequestId` per mutating call. The app remembers recent IDs per proposal, so a duplicate returns the original result.
- **Errors:** `{code, message, path?, retryable, details}`. Codes: `VALIDATION_FAILED`, `REVISION_CONFLICT`, `NOT_FOUND`, `LOCKED`, `APPROVAL_REQUIRED`, `APPROVAL_DENIED`, `CAPABILITY_UNAVAILABLE`, `OUT_OF_SCOPE`, `JOB_CANCELLED`, `APP_NOT_RUNNING`.
- **Permissions:**
  - A per-project AI policy: read-only / propose-only / auto-apply non-destructive.
  - Destructive ops (`remove_ranges`, `delete_clip`, `replace_subtitles`, track deletion) and `start_export` **always require approval** in the app UI.
  - No filesystem paths, no shell, no network fetch through MCP.
  - Media import requires a user consent grant.
- **Progress and cancellation:** MCP progress notifications plus job polling, and `cancel_job` wired to the existing AbortController pattern.
- **Locking and concurrent edits:**
  - The app is the single writer. It serializes UI and agent transactions.
  - While the user is mid-gesture (dirty session), agent commits wait or return `LOCKED`, which keeps the existing 15 s dirty-window semantics [V].
  - No client, headless or not, touches `editor.json`; only the `DocumentService` writes it (§2h).
- **Gemini agent:** reuses the same gateway and proposal flow, so it no longer skips scope checks [V gap]. Uploads require per-project consent and DELETE after the session (M2).

---

## 9. Roadmap (vertical slices)

Order:
- P0a (original baseline) → P0b (hardening) → P0c (post-hardening baseline) → P1 (gate) → P2 → P4.
- **P3 runs in parallel with P1/P2** as independent slices P3.0–P3.11: P4 needs only P3.1; P5b needs P3.1 plus a read projection; P9 needs P3.9.
- P5 (gate R-PoC) → P6 → P7 → P8 → P9 → P10. P11 runs continuously, with a final hardening pass.

Rationale for the deviation: integration needs only the time module and the offset field (P3.1), not the whole v3 migration, and the scene evaluator can read a v3 projection of the v2 document, so the large UI refactor is never on the critical path.

### P0 — Original baseline → hardening → post-hardening baseline (strict order)
- **Objective:** measure the untouched repository first; only then change anything; then measure again, so the effect of hardening is visible and the original numbers stay available for every later comparison.
- **Hard rules:**
  - P0a completes and its artifacts are **frozen** before P0b begins. No dependency, identity, feature or code change precedes P0a.
  - The original baseline is measured in an **isolated detached worktree** at `143a0d6`, outside the working repository directory, with **external tooling only**; nothing is injected into the app.
  - Two result sets that are never merged or overwritten: `docs/baseline/original-143a0d6/` (immutable) and `docs/baseline/post-hardening/`.
- **P0a — Original baseline (no code change; the worktree stays clean):**
  1. **Verify free space first** (`df -h`) and pick the worktree volume. Requirement [P]: ≥ 30 GB free (`node_modules`, Electron, a build, and two 10-minute recordings; the install-and-build footprint is estimated at 3–5 GB [S], not measured) **and** the system volume (where swap lives) must not be nearly full, otherwise the memory measurements are tainted. The audit saw 3.5 GiB free on the repository volume; a re-check on 2026-11-15 found **3.5 GiB free on the repository volume and 12 GiB free on the internal volume**, so P0a is **blocked until more space exists**.
  2. `git worktree add --detach <path> 143a0d6`. The main working tree is not touched.
  3. Record the environment: model and chip, macOS version, power source, `pmset -g`, thermal state, attached displays and cameras, free disk, Node/npm versions, Electron version, git SHA, lockfile hash.
  4. Toolchain: Node 22 to match CI (the machine has Node 24.18; installing 22 is a toolchain change that needs approval). Use `npm ci` only, never `npm install`. Its `postinstall` downloads the pinned FFmpeg (SHA-256 pinned): a **network fetch that needs explicit approval**.
  5. Static baseline: `npm run verify:ffmpeg`, `npm run typecheck`, `npx vitest run --reporter=verbose` ×3 (flakiness), `npm run build`, `npm run test:mcp`, and `ffmpeg -encoders | grep videotoolbox` from the pinned binary. Failures are **recorded, not fixed**. No coverage run (it needs a new dependency).
  6. Runtime baseline with scripts kept **outside** the worktree (`~/ovc-bench-tools/`): B0 idle; B1 startup; B2o recording with the original MediaRecorder path (screen only; screen + camera + microphone; system audio if it works); B7o export of what the original supports (camera and layout export are recorded as **N/A**, not zero); B8o transcription (the model download is a network fetch that needs approval). Build only through CLI overrides (for example `electron-builder --dir -c.mac.forceCodeSigning=false`, or `electron .` on the built output), never by editing files. Record which launch mode was used, because a dev run and a packaged build differ in memory.
  7. Each scenario N ≥ 3 with median and IQR; outliers are kept. Sampling per §2f. `powermetrics` needs sudo and is run by the user.
  8. Prove the worktree is clean: `git status` empty and `git diff 143a0d6` empty, recorded in the report.
  9. Freeze: raw data, environment file and a checksum manifest, later committed read-only to `docs/baseline/original-143a0d6/`.
- **P0b — Hardening and identity (only after the P0a freeze):** fork identity retarget (appId, productName, publish, Team ID); bump Electron / zod / MCP SDK; arm64-only; auto-update off; remove ACE-Step; CI hardening (SHA pins, `npm audit`, scoped permissions); `@vitest/coverage-v8` decision recorded; ADR-0000 and the ADR stubs.
- **P0c — Post-hardening baseline:** rerun the same scenarios with the same external harness. The in-repository harness (`scripts/bench/`, `--bench`) is added now and cross-validated against the external one on one scenario (within 5% [P]) before it gates regressions. Results go to `docs/baseline/post-hardening/`, plus a delta report original → post-hardening that isolates the effect of the Electron bump, ACE-Step removal and arm64-only.
- **Files (P0b and P0c only):** `package.json` (build/appId/publish/arch/fuses), `src/main/auto-updates.ts`, `scripts/verify-mac-release.mjs`, `.github/workflows/{ci,release}.yml`, `acestep_generate.py` + `music-generation.ts` (remove), new `scripts/bench/`, `docs/adr/`, `docs/baseline/`.
- **Acceptance:**
  - Original baseline exists, is frozen, and was produced from a verified-clean worktree at `143a0d6`.
  - Test results are documented with real pass/fail, including failures.
  - After P0b: the app builds and signs under the fork identity; `npm audit` shows no high or critical advisories in runtime dependencies.
  - Post-hardening baseline and delta report exist.
- **Tests:** the existing suite (pass state is **unknown** until P0a); CI green on macOS (Windows matrix dropped) after P0b.
- **Perf validation:** P0a and P0c produce the two baselines.
- **Risks:** insufficient disk (currently blocking); the Electron 43.0.0 baseline carries known advisories, so it runs locally only and exercises no network features beyond the approved fetches; the Electron bump breaks APIs; failing tests discovered.
- **Rollback:** P0a creates only a worktree (remove with `git worktree remove`) and a bench-tools directory; P0b dependency bumps are reverted separately from identity commits.
- **DoD:** both baseline reports contain measured numbers only, each stating its method, launch mode and environment.

### P1 — Native capture PoC (go/no-go gate)
- **Objective:** answer viability with measurements (§4).
- **Decisions:** SwiftPM, Swift 6 strict concurrency; protocol v1 dry-run on stdout.
- **Files:** new `native/capture-poc/**`, `native/protocol/v1/**`, `scripts/bench/sync-analyzer.mjs`, `scripts/bench/clapper.html`.
- **Dependencies:** P0 bench harness, hardware (M1 8 GB, 2 displays, 2 UVC webcams).
- **Tasks:**
  1. Display, camera and mic capture.
  2. Writers.
  3. Manifest.
  4. Sync analyzer.
  5. Scenarios T1–T11 on topology M (§2d), gates G-SIGN and G-TCC (§2e), and the multi-camera matrix (§2g).
- **Acceptance:** §4 criteria; report ADR-0001 with go / partial / no-go.
- **Tests:** Swift unit tests (clock, manifest); scenario scripts.
- **Perf:** all PoC metrics.
- **Risks:** encoder saturation, webcam concurrency, TCC layout.
- **Rollback:** none needed (isolated). On no-go, take the interim Chromium path: `avc1` MediaRecorder + per-track `performance.now()` offsets (audit H1/H2 interim).
- **DoD:** a decision recorded with data.

### P2 — Capture engine: synchronization, pause/resume, crash recovery
- **Objective:** a production-quality `ovc-capture` from the PoC.
- **Decisions:** fragmented movies (or segmented files if T7 required it), CAF audio, protocol v1 final, single helper.
- **Files:** `native/capture/` (library `OVCCaptureCore` + executable), `native/protocol/v1/`.
- **Tasks:**
  1. Session state machine.
  2. Device loss and restore.
  3. Disk guard.
  4. Pause offsetting.
  5. Drift compensation if the PoC requires it.
  6. Stats, levels and thumbs.
  7. Manifest v1.
  8. Standalone `recover <sessionDir>` subcommand.
- **Acceptance:** PoC criteria hold in the production build; recovery subcommand repairs 20/20 synthetic kills (CI) and ≥ 19/20 real kills.
- **Tests:** Swift unit + synthetic-buffer writer tests, contract fixtures, hardware nightly subset.
- **Perf:** B3/B4 on hardware.
- **Risks:** concurrency bugs (Swift 6 actors help); audio clock drift.
- **Rollback:** the helper is unused until P4 flips the flag.
- **DoD:** tagged helper build signed and notarizable; hardware report.

### P3 — Domain v3, delivered as small reversible vertical slices (parallel with P1/P2)
- **Objective:** domain operations become the single mutation path and v3 the schema, **without a big-bang UI migration**. Every slice ships on its own, behind its own flag, with an equivalence test and a one-step rollback. P3.0–P3.2 change nothing the user can see.
- **Cross-cutting decisions:** time model §2c; Track/Clip/MediaSource entities; migration registry; Immer patches (adopt or reject after a measured document-size check in P3.1); Zod generated or drift-tested.
- **The dual-run rule applied to every slice:** the slice's legacy handler stays in the tree until the slice has soaked. A differential test replays recorded interaction traces through the legacy handler and through `dispatch(ops)` and asserts identical v2-serialized state. The flag `domain.<slice>` defaults off, goes on after soak, and the legacy code is removed only in P3.11. The persisted document keeps its existing revision-CAS save of a full snapshot until P3.10, so there is never more than one writer. Until P3.8, a unified undo controller treats legacy segment-undo entries as opaque and orders them with new history entries by sequence number.

| Slice | Scope | Depends on | Flag | Acceptance | Rollback |
|---|---|---|---|---|---|
| P3.0 | Safety net: frozen v2 fixtures from real projects; golden tests for all 31 operation kinds; Zod⇔TS drift test (fixes the known `set_text_overlay` and `set_background` drift); scaffold of the time-suffix lint | none | none (tests only) | Existing and new tests pass; the drift test fails on a deliberately drifted type | Revert the tests |
| P3.1 | `src/shared/time/` (§2c); v3 types; migration registry v1→v2→v3 as **pure, read-only** functions; the writer stays v2 | P3.0 | `editor.schema=2` (default) | Fixtures round-trip within 1 tick; every v2 fixture → v3 → v2 projection equals the original; Immer document-size measurement recorded | Nothing consumes v3 yet |
| P3.2 | Renderer document store and `dispatch(ops)` adapter; **no feature migrated** | P3.1 | `domain.store` | A no-op dispatch reproduces the current save payload exactly; save/reload unchanged | Flag off removes the adapter |
| P3.3 | Timeline segments (move, trim, split, delete, sequence, ripple) through ops; legacy segment undo kept; new history also records these ops | P3.2 | `domain.timeline` | Differential traces identical; undo/redo identical to legacy on recorded traces | Flag off |
| P3.4 | Audio levels, lanes, master volume | P3.3 | `domain.audio` | Differential traces identical | Flag off |
| P3.5 | Zoom and speed effects | P3.3 | `domain.effects` | Differential traces identical | Flag off |
| P3.6 | Text overlays and subtitles (content and style) | P3.3 | `domain.text` | Differential traces identical | Flag off |
| P3.7 | Layout, camera, screen, background, corners | P3.3 | `domain.layout` | Differential traces identical | Flag off |
| P3.8 | One transactional history replaces the legacy segment-undo stack | P3.3–P3.7 | `domain.history` | Property test: applying an operation and then its inverse returns the identical document, for every operation kind | Flag off restores the legacy stack |
| P3.9 | Main-process `DocumentService` becomes authoritative; the renderer becomes an optimistic replica (§2h) | P3.8 | `domain.authority=main` | Commit round-trip latency measured (p95 ≤ 50 ms [P]); rejected commit rolls the replica back; gesture frame rate unchanged | Flag back to `renderer` |
| P3.10 | Flip the default writer to schema v3; `editor.v2.backup.json` kept; reader accepts both | P3.9 + soak [P: 2 weeks of internal use] | `editor.schema=3` | open → save → open is lossless; v2 projects stay untouched until their first save | Flag back to 2 and the backup restore tool |
| P3.11 | Remove the legacy handlers; stop writing `edits.json` / `subtitles.json` | P3.10 soak | none | Grep/lint check: no direct document-field mutation remains | `git revert` of the slice |

- **Dependencies from other phases (reduced):** P4 needs only **P3.1** (time module and `…Ticks` types). It stores offsets in an additive `project.json` v2 field `tracks[*].captureOffsetTicks`, and the editor's initial placement (currently `sourceStart: 0` at `timeline-utils.ts:112` [V]) reads it while the editor document is still v2. P5b needs P3.1 plus an in-memory v2→v3 read projection until P3.10. P9 needs **P3.9**.
- **Files:** `src/shared/editor-domain/{types,schema,operations,operation-schema}.ts` + new `migrations/`, `history.ts`; new `src/shared/time/`; renderer `useTimelineEditing.ts`, `useEditorPersistence.ts` and the timeline hooks (one slice at a time); `src/shared/types.ts` (dedupe `EditorProjectStateFile`).
- **Tests:** per-operation accept / reject / inverse; migration fixtures; drift test; differential traces per slice; existing domain tests unchanged or migrated with a documented reason.
- **Perf:** history memory cap [P: 200 entries / 32 MB]; apply latency p95 ≤ 16 ms on a 60-min project [P].
- **Risks:** the renderer is ~22k lines; mixing legacy and migrated handlers during the transition (mitigated by the dual-run rule and the unified undo controller); `DocumentService` IPC latency (measured in P3.9).
- **Rollback:** every slice is one flag; P3.10 also has the v2 backup file.
- **DoD:** every editor feature is dispatched through operations, MCP and UI share them, and the legacy handlers are gone.

### P4 — Electron/native integration
- **Objective:** record from the app with the native engine; correctly synchronized timelines.
- **Files:** new `src/main/capture/{protocol.ts,supervisor.ts,native-engine.ts,chromium-engine.ts,recovery.ts}`, `src/main/process-supervisor.ts` (generalized from `runProcess`), `project-store.ts` (session import, `project.json` v2), recorder UI (`RecorderController.tsx` → engine-agnostic), `desktop-permissions.ts` (helper-backed status), `package.json` build (helper in bundle), `scripts/after-pack.cjs`, `verify-mac-release.mjs`.
- **Tasks:**
  1. `CaptureEngine` interface.
  2. Supervisor (spawn, handshake, heartbeat, restart policy).
  3. IPC gateway for the recorder channels.
  4. Session import → media entries with `captureOffsetTicks` (`HostNs` → `Ticks` at the importer boundary, §2c), stored in the additive `project.json` v2 field; the editor's initial placement reads it (no dependency on P3.10).
  5. Launch-time recovery service.
  6. Permission onboarding.
  7. Feature flag `capture.engine`.
  8. Package and sign the helper with the method that passed G-SIGN, in the layout that passed G-TCC (§2e).
- **Acceptance:** record T3 load from the app; the editor opens with correct offsets (sync analyzer on the exported result ≤ 1 frame); a forced quit mid-recording is recovered at next launch; the Chromium engine still works behind the flag.
- **Tests:** fake-helper integration, gateway tests, contract tests, e2e smoke (fake helper), hardware B3.
- **Perf:** B2/B3 vs P0 baseline.
- **Risks:** packaging/TCC surprises; recorder UI coupling.
- **Rollback:** flip `capture.engine=chromium`.
- **DoD:** native is the default on macOS 14.2+; notarized build verified.

### P5 — Shared render semantics & preview/export parity (gate R-PoC first)
- **Objective:** export equals preview.
- **Step 5a — R-PoC (≤ 2 weeks):**
  - WebGL2 compositor + WebCodecs decode/encode, tested with scenes S1–S3 and tests R1–R12 of §2i (deterministic seeking and stepping, VFR, color, bounded frame memory, proven hardware acceleration, 1080p30/60 export).
  - Apply the §2i pass/fail thresholds and the definition of "1.0× realtime".
  - Decide WebGL single backend vs native fallback, the preview player, the working color space and the 60 fps claim (ADR-0002).
- **Step 5b:**
  - `src/shared/render/` scene evaluator (moving `layout-geometry`, `zoom-utils`, text metrics).
  - Compositor in `src/renderer/render/`.
  - Export pipeline in a hidden render process.
  - Retire ffmpeg video compositing behind flag `export.engine`.
- **Files:** `useEditorDerivedData.ts`, `PreviewContent.tsx`, `PreviewVideo.tsx`, `PreviewTransitionLayer.tsx`, `TextOverlayLayer.tsx`, `composition-export.ts`, `editor-export.ts`, `ffmpeg.ts` (split), `src/mcp/server.ts` capability flags.
- **Acceptance:** camera, layouts, backgrounds, corners, zoom, transitions and text export identically (golden SSIM ≥ threshold [P 0.98]); capability flags `true`; 60 fps and source dimensions truthful; bitrate scaled by resolution.
- **Tests:** scene-evaluator goldens; compositor parity (Playwright); export e2e on real ffmpeg; 60 fps/source-dimension tests.
- **Perf:** B6/B7.
- **Risks:** WebCodecs availability, GPU memory, Electron offscreen limits.
- **Rollback:** `export.engine=ffmpeg-legacy`.
- **DoD:** the README's "preview-only" caveat removed with evidence.

### P6 — Preview performance on 8 GB
- **Objective:** smooth editing of long multi-source projects.
- **Tasks:**
  1. Background job queue (pauses during record/export).
  2. 720p proxies.
  3. ffmpeg audio peaks (real waveform).
  4. Sprite thumbnails.
  5. LRU byte-capped caches.
  6. Remove the whole-file renderer decode (`media-utils.ts:320-345`).
- **Files:** `thumbnail-cache.ts`, `BezierAudioWaveform.tsx`, `media-utils.ts`, new `src/main/media/{proxies,peaks,thumbs}.ts`.
- **Acceptance:** B5/B6 budgets; editor-renderer physical footprint within the §2f budget on a 60-min project.
- **Tests:** proxy/peaks generation with ffmpeg; cache eviction units; memory test on hardware.
- **Rollback:** proxies are optional per project.
- **DoD:** hardware report vs baseline.

### P7 — Audio pipeline
- **Objective:** one `AudioMixPlan` for preview, export and analysis; professional processing.
- **Tasks:**
  1. Plan compiler for WebAudio and ffmpeg.
  2. `acrossfade` transitions.
  3. Limiter.
  4. Optional loudness target (two-pass `loudnorm`).
  5. Per-track gate/compressor/EQ.
  6. Explicit mic constraints (native path: raw input).
- **Acceptance:** numeric parity (RMS/peak/LUFS within tolerance [P ±0.5 dB / ±1 LU]); no export clipping above −1 dBTP with the limiter on.
- **Tests:** plan compile goldens; ffmpeg measurement tests.
- **Rollback:** processing nodes default to off.
- **DoD:** the three mix implementations reduced to one plan.

### P8 — Overlays, animation, templates, styled subtitles
- **Objective:** text, cards, lower-thirds, modals, subtitles with styles, and reusable templates, exported faithfully.
- **Tasks:**
  1. Overlay tracks.
  2. Keyframe animation.
  3. Template schema, library and instances.
  4. Canvas raster cache shared by preview and export.
  5. Subtitle styles (karaoke/boxed/pop) rendered by the compositor (not SRT burn-in, fixes H9).
  6. Optional cursor/click sidecar from the helper for auto-zoom.
- **Acceptance:** every template and style has parity goldens; templates are versioned and migratable.
- **Tests:** template schema tests, keyframe evaluation units, goldens.
- **Rollback:** templates are additive.
- **DoD:** template catalog v1 shipped.

### P9 — MCP v2 & AI transactions
- **Objective:** AI manipulates the project safely through the same ops (§8).
- **Tasks:**
  1. App AI gateway (UDS + token).
  2. Helper `mcp-bridge` subcommand, `runAsNode:false`.
  3. Proposal store and approval UI.
  4. Typed tool groups.
  5. Jobs with progress and cancel.
  6. `render_frame`.
  7. Gemini on the same gateway with consent + DELETE.
- **Acceptance:** an agent can analyze, propose cuts, zooms, subtitles and overlays, preview them, have the user approve, then export, with every destructive op approved; a client started while the app is closed gets `APP_NOT_RUNNING` (or a background launch when `ai.allowBackgroundLaunch` is on) and never a second write path; `import_media` works via consent.
- **Tests:** MCP contract tests per tool, proposal conflict tests, idempotency, approval-denied path, smoke moved into Vitest.
- **Rollback:** the legacy `apply_edit_plan` tool remains for one release behind a flag.
- **DoD:** the MCP capability matrix is documented and tested.

### P10 — Transcription & analysis consolidation
- **Objective:** one memory-bounded STT pipeline plus richer analysis.
- **Decision:** one quantized pipeline, either Transformers.js in a `utilityProcess` or whisper.cpp (Metal) in the helper. Decide by B8 measurement. Pin and bundle (or checksum-download) the model.
- **Tasks:**
  1. Streamed PCM windows.
  2. Disposal after use.
  3. Remove the second pipeline.
  4. Add scene-change, loudness and mistake-detection analyses for AI.
- **Acceptance:** B8 budget.
- **Rollback:** cloud STT remains.

### P11 — Distribution & hardening (continuous; final pass before 2.0)
- **Tasks:**
  1. Fork update feed + signed update metadata.
  2. Helper signing verification.
  3. Fuses.
  4. Sandbox where feasible.
  5. License report.
  6. Source offer.
  7. Legal review items (§7).
  8. Optional LGPL ffmpeg evaluation.
- **Acceptance:** `verify-mac-release` covers app + helper + ffmpeg; notarized DMG installs on a clean macOS 14.2 and 15 machine; auto-update from fork feed tested.
- **DoD:** release checklist executed and recorded.

---

## 10. Open items / user decisions still needed (not blocking this plan)
- Hardware: the working Mac (MacBookPro17,1, M1, 8 GB, macOS 26.5.2) already has an external 3440×1440 display and three cameras. Still missing: hardware or boot volumes for **macOS 14.2 and 15** (needed by G-TCC), a ≥ 100 GB external SSD for P1 recordings (§2d), and optionally a 4K display (O7). A dedicated self-hosted runner for the hardware CI tier is also needed.
- **Disk space blocks P0a.** Re-checked 2026-11-15: 3.5 GiB free on the repository volume (external USB APFS, 119 GiB, 98% used) and 12 GiB free on the internal volume (228 GiB, 94% used). A baseline taken on a nearly full system volume would also be tainted, because swap lives there.
- Whether Intel support is truly dropped (assumed yes).
- Fork name/trademark (legal item 6).
- Engram project scope is ambiguous (`open-video-craft` vs `openvideocraft`), so memory was not read or written this session.

## 11. How this plan will be verified
- P0a replaces every [S]/[H] statement about the *original* app with measured data (or flags it); P0c does the same for the hardened app. Every later budget [P] is re-calibrated against the original baseline.
- P1 and the P5a spike are explicit go/no-go gates with written ADRs containing raw data.
- Every phase's DoD includes a hardware report against the stored P0 baseline and passing CI (unit, contract, integration, parity, e2e as introduced).
- This plan is saved in the repository as `docs/adr/0000-architecture-roadmap.md`, with ADR stubs `0001`–`0008` and an index. Committing them is a separate step that needs an explicit instruction.

---

## 12. Revision 2 — what changed

| # | Request | Changes |
|---|---|---|
| 1 | P0 baseline ordering | P0 rewritten as **P0a original baseline → P0b hardening → P0c post-hardening baseline**, with a hard freeze between P0a and P0b. Isolated detached worktree at `143a0d6`, external-only tooling, no code, dependency or identity change before the freeze, two immutable result sets. §2j, §5 (principle, two-tier harness), §9 order, §11. Disk finding recorded (§10, P0a step 1). |
| 2 | Multi-camera | New §2g. Verified from Apple's documentation that `AVCaptureMultiCamSession` is **not listed for macOS** (it is for Mac Catalyst 14). Six candidates C1–C6 compared, a test matrix on the three real cameras, and a decision rule. ADR-1 webcam row corrected. |
| 3 | Rendering spike | New §2i. Tests R1–R12 (deterministic seeking, frame stepping, VFR, color, bounded frame memory, proven hardware acceleration, 1080p30 and 1080p60 export), explicit definition of "1.0× realtime", numeric thresholds, hard-kill versus downgrade rules. ADR-4 and P5a point to it. |
| 4 | Memory | New §2f. RSS, physical footprint and shared GPU/IOSurface memory defined and separated; budgets at three levels (per process, whole application, system gates); measurement protocol; RSS is never a pass metric. B0, B7, B8, P6 and §4 acceptance patched. |
| 5 | Time model | New §2c. Units `Ticks`, `HostNs`, `Micros`, `Sec`, rational timebase, with a mandatory field suffix and eight named conversion boundaries. Every `…Us` field in ADR-3, ADR-4, ADR-5 and the MCP tables was renamed (`…Ticks` in the domain, `…Sec` in MCP). |
| 6 | MCP headless | New §2h. One implementation (the shared TS package), one authority (main-process `DocumentService`). The offline proposal path and the offline read path were **removed**; the bridge relays bytes only; opt-in background launch. ADR-7, §8, P9 acceptance and the diagram patched. |
| 7 | PoC scope | New §2d. Topology M (4 video + 2 audio tracks), mandatory / optional / fallback capability classes, disk rate recomputed with **2** audio tracks (263–413 MB/min; the earlier 3-track figure is withdrawn). T1–T5 redefined. |
| 8 | Permissions | New §2e. G-SIGN and G-TCC are explicit experimental gates with matrices, pass criteria and fail ladders. §2b "Packaging and TCC" relabeled as hypotheses. The OS-coverage gap (this Mac runs macOS 26.5.2) is stated. |
| 9 | P3 risk | P3 split into **twelve reversible slices P3.0–P3.11**, each with its own flag, differential test and rollback, plus the dual-run rule. P4 now depends only on P3.1, P9 on P3.9. |

---

## 13. Decisions that remain conditional

| Decision | Gate that decides it | Fallback if it fails |
|---|---|---|
| Standalone Swift helper process (ADR-2) | P1 PoC, G-SIGN, G-TCC | In-process native addon (ADR-2 reopened), or Chromium capture |
| Minimum macOS 14.2 | G-TCC on 14.2 and 15 hardware | Raise the minimum to the lowest tested version |
| Concurrent ScreenCaptureKit streams for two displays (M1) | T2 | F2 (30 fps / 1× scale); otherwise the second display stays on Chromium capture |
| Multi-camera approach (C1–C6) | §2g matrix | C6 hybrid with Chromium cameras |
| System audio through ScreenCaptureKit (process tap deferred) | T2, T3, T6 | F5 process tap |
| Crash-safe container (fragmented `.mov` versus CMAF segments versus segmented files) and CAF audio | T7 | F4 segmented files |
| HEVC versus H.264 | T3, T4 | F1 H.264 |
| Clock conversion, pause method, per-device sync offset | T6, T9 | New segment per resume; calibrated per-device offset |
| Per-file helper signing method | G-SIGN | Method A → B → C → nested helper `.app` |
| TCC attribution layout | G-TCC | Layout L1 → L2 → L3, or permission requests from main |
| WebGL2 + WebCodecs single rendering backend | R-PoC R1–R10 | AVFoundation + Metal compositor inside the helper |
| WebCodecs preview player | R9 | `<video>` with shared shaders (frame-exact only when paused) |
| 60 fps export claim | R8 | Limit export to 30 fps |
| Working color space SDR BT.709 / sRGB | R4 | Shader fix; HDR is refused or tone-mapped |
| Memory and performance budgets | P0a original baseline | Recalibrate every [P] value |
| `DocumentService` authority in main | P3.9 latency measurement | Renderer keeps authority; main hosts a read replica |
| Opt-in background launch for MCP | P9 test | `APP_NOT_RUNNING` only |
| Immer patches for history | P3.1 document-size measurement | Hand-written inverse operations |
| LGPL ffmpeg and a future Mac App Store path | Legal review (§7) | DMG only |

Already decided (not conditional): flick `Ticks` as the stored time unit (verified by the P3.1 property tests); the single-helper rule; arm64-only distribution; one authoritative domain implementation.
