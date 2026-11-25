# AUDIT — Open Video Craft (fork baseline)

- **Audited:** `main` @ `143a0d6` (2026-09-25, "Release 1.0.6"), origin `https://github.com/Reubencfernandes/Open-Video-Craft.git`
- **Latest stable release:** `v1.0.5` (2026-07-29). `main` is 3 commits ahead (`package.json` = 1.0.6, unreleased). The `v2.x` tags are the owner's pre-release beta builds (`v2.3.3` = 2026-07-20, before `v1.0.1`); upstream's own `AUDIT.md` (v1.0.2) states they are "not part of the public stable update line". They are not newer releases.
- **Audit date:** 2026-11-15. **Mode:** read-only. No dependencies installed, no scripts run, no app launched, **no tests executed, no benchmarks run**.
- **Evidence legend:** *Verified* = read in code (path:line). *Measured* = a command I ran (listed). *Static* = follows from code structure. *Estimate* = reasoning/arithmetic, not measured. Where a finding was reported by a sub-investigation, Critical/High items were re-checked by the main agent against the source; any correction is noted.
- **Goal being audited against:** lightweight, high-quality macOS-first recorder/editor for Apple Silicon with 8 GB RAM.

> Environment note: `node_modules` is absent, so Electron 43 / Chromium behavior (e.g. system-audio loopback on macOS) could not be exercised. Findings that depend on it are marked unverified.

---

## 1. Executive summary

Open Video Craft is a clean, security-conscious Electron app (React 19, TS, Vite 8, Vitest) with a **well-designed editor domain model and a careful project/IPC containment layer**. It is a good *editing* foundation. It is a weak *recording and export* foundation for our objective:

1. **Export does not render what the user sees.** Webcam, layouts, backgrounds and corner styling exist only in the preview; export is a bare screen/imported-clip filtergraph. The README admits this (`README.md:113-114`).
2. **Capture is Chromium `MediaRecorder` VP9 WebM (software) with no per-track sync offsets, no crash recovery, no cursor metadata**, and a system-audio path that is unverified on macOS.
3. **Several code paths are 8 GB hazards:** whole-file `arrayBuffer()` + `decodeAudioData` in the renderer for subtitles, two resident Whisper pipelines, and a 3.5B fp32 music model.
4. **Packaging is Apple-Silicon-capable but not Apple-Silicon-first**, and the FFmpeg shipped is **GPLv3** (unresolved for the Mac App Store; fine for DMG with source offer).
5. **Dependencies carry known advisories**, including the locked **Electron 43.0.0** (high). Measured, see §7.

Size: `src/main` 38 files / 9,267 lines; `src/renderer` 138 / 22,674; `src/shared` 10 / 2,194; `src/mcp` 2 / 408; `src/preload` 1 / 255; `tests` 78 / 7,549 lines (measured with `wc -l`).

---

## 2. Architecture and data flow

```
Renderer (React, 6 BrowserWindows incl. recorder + editor)
  RecorderController ── getDisplayMedia / getUserMedia ── MediaRecorder x(screen,camera,mic,system)
        │  5 s chunks (Blob→ArrayBuffer→IPC)                          [recorder-utils.ts, RecorderController.tsx:517]
        ▼
Main process (main.ts, 62 ipcMain channels)
  project-store.ts  append chunks to  <project>/media/*.webm ; rewrite project.json per chunk
  on stop: ffmpeg remux WebM + WebM→48 kHz WAV (mic/system)           [main.ts:1529-1560, ffmpeg.ts]
        ▼
Project folder: project.json, edits.json, subtitles.json, editor.json, media/*
        ▲                                   ▲
Editor (renderer): shared/editor-domain (schema, operations, undo)   MCP server (stdio, src/mcp/server.ts)
  Preview = DOM/CSS + HTML <video>/<audio> (no WebGL/WebCodecs)       apply_edit_plan → same domain ops
        │ export request
        ▼
Main: composition-export.ts → ffmpeg.ts builds ONE -filter_complex → h264_videotoolbox | libx264 → file
```

Key structural facts (verified):
- **Preview and export share no render code.** Preview is React/CSS; export is hand-built ffmpeg expression strings. Parity is kept by copied constants and comments (e.g. `ffmpeg.ts:581` "Mirrors the preview's text-shadow").
- **Editor state is an operation-based domain** (`src/shared/editor-domain/{schema,operations,operation-schema,types}.ts`), shared by the UI, the MCP server and the Gemini agent. Persisted via `editor-document-store.ts` with revision CAS + lock file.
- **Media is served via custom protocols** `ovc-media` / `ovc-import` with HTTP range support (`media-protocols.ts:83-126`).
- **FFmpeg** is a downloaded, SHA-256-pinned third-party static build (Martin Riedl 8.1.2) that overwrites `ffmpeg-static` in `postinstall`/`afterPack` (`scripts/prepare-ffmpeg.mjs:33-42`).

---

## 3. Findings

Complexity: S ≤ 1 day, M ≈ 2–5 days, L ≈ 1–3 weeks, XL > 3 weeks (rough, for one engineer).

### 3.1 Critical

| ID | Finding | Evidence | Impact | Recommendation | Cx |
|---|---|---|---|---|---|
| C1 | **Export omits webcam, layouts, background, corner styling.** Export is the bare screen (`scale…,pad…` black bars) plus audio/zoom/speed/transitions/text. | `composition-export.ts:41-48` registers only screen, mic, system-audio, imports. Measured `grep -i camera\|layoutMode\|backgroundStyle\|cornerStyle` over `composition-export.ts`, `editor-export.ts`, `ffmpeg.ts` = **0 hits**. `server.ts:256` `cameraCompositing:false, layouts:false`. `README.md:113-114` "remain preview-only". `ffmpeg.ts:689-690`. No `captureStream/VideoEncoder/WebCodecs` anywhere in `src` (measured). | The product's headline output (screen + webcam over styled background) cannot be exported. Preview ≠ export. | Build a shared geometry module (preview + export) and a native/GPU compositor; do not extend the ffmpeg filtergraph for layouts long-term. | XL |

### 3.2 High

| ID | Finding | Evidence | Impact | Recommendation | Cx |
|---|---|---|---|---|---|
| H1 | **No per-track capture timestamps; A/V sync assumed zero offset.** Up to 4 independent `MediaRecorder`s start in separate calls; editor places every track at `sourceStart: 0`. Commit `a3b0d98` fixes only *editor-side linked-audio* edits. | `RecorderController.tsx:517` `recorder?.start(recordingRuntime.chunkMs)` (the sub-agent quoted a different line/literal; corrected). `timeline-utils.ts:112` `sourceStart: 0` (verified). Project stores one `startedAt` + `durationMs` (`types.ts`). | Constant offset + drift between screen/cam/mic/system, worst on long takes. (Static; magnitude *not measured*.) | Record `performance.now()` at each recorder's `onstart` and first chunk; store per-track `startOffsetMs`; apply in editor; ffprobe `start_time` per track after remux. | M |
| H2 | **Capture = Chromium MediaRecorder, VP9→VP8 WebM, software encode, up to 24 Mbps at native Retina.** No ScreenCaptureKit/AVFoundation, no H.264/HEVC. | `recorder-utils.ts:13-17`; `recording-runtime.ts:11` (8 Mbps default, 30 fps); `quality.ts:15-21` (native = 24 Mbps). Only `videotoolbox` use is export (`ffmpeg.ts:925`, measured). | Estimate: heavy CPU/RAM on an 8 GB M-series while also capturing; high disk rate (24 Mbps ≈ 180 MB/min screen track, arithmetic). Chromium has no VP9 HW encode on macOS (known platform fact, not tested here). | Interim: prefer `video/mp4;codecs=avc1` if `isTypeSupported`; default 1080p/8 Mbps on 8 GB. Target: native Swift helper (SCStream + VideoToolbox + AVAssetWriter). | S interim / XL native |
| H3 | **No crash recovery.** Chunks are appended to disk every 5 s (good), but nothing at launch repairs projects stuck in `recording`/`processing`; raw WebM has no duration/cues. | `project-store.ts:158,179,209,243,254` (status handling); only `main.ts:404` window-close path (grep of `"recording"\|"processing"` in `src/main`, measured). | A crash/force-quit leaves an unseekable, unrecoverable-looking project. | On launch scan statuses; remux + prepare audio; mark `recovered`. | M |
| H4 | **Renderer decodes whole media files into RAM for subtitles.** | `media-utils.ts:320-345` `response.arrayBuffer()` → `decodeAudioData` → `new Float32Array` (verified); called per clip. | Estimate: native-rate float32 ≈ 23 MB/min stereo plus mono/16 kHz copies; a long recording can exhaust the renderer on 8 GB. | Reuse main-process ffmpeg PCM path (`editor-analysis.ts:182`), stream in windows. | M |
| H5 | **Two resident Whisper pipelines.** Renderer worker: wasm, `numThreads = 1`, no dtype/quantization. Main: `onnxruntime-node`, model cached for app lifetime, whole PCM held (512 MB cap + `slice` copy). | `subtitle-transcription.worker.ts:43`; `editor-analysis.ts:46,183-187,246`. Model `onnx-community/whisper-base_timestamped` fetched at runtime, unpinned. | Estimate: hundreds of MB resident indefinitely; slow single-thread wasm. (WebGPU attempt in the worker was *not* confirmed by my grep.) | One pipeline, quantized, disposed after use, run in a `utilityProcess` or native whisper.cpp (Metal/CoreML); pin + bundle model. | M–L |
| H6 | **Export encode is fixed-bitrate and all-software filtering.** `h264_videotoolbox` only, `-b:v 8M` regardless of resolution; libx264 `-preset medium -crf 20` silent fallback; no `-hwaccel`; no HEVC. `verify-ffmpeg.mjs` never asserts videotoolbox exists. | `ffmpeg.ts:884,923-925`; `-hwaccel` = 0 hits; `verify-ffmpeg.mjs:14-16`. | Quality-starved at 1440p/4K, CPU-bound filtering. | Scale bitrate by res/fps, add `hevc_videotoolbox`, `-hwaccel videotoolbox`, assert encoders at build time. | S |
| H7 | **Zoom filter is per-frame upscale then crop.** | `ffmpeg.ts:487-488` `scale=…eval=frame,crop=`; `operations.ts:207` bounds 1–4× but `schema.ts` zoom validation does not. | Static: large intermediates (up to 4× output) → slow, memory-heavy export vs. CSS-transform preview. | Crop first, then scale; enforce bounds in schema. | M |
| H8 | **Composition export opens one ffmpeg input per segment** (+`split/trim/tpad/xfade`), and spawns one `ffmpeg -i` per segment to probe audio. `fps=30` forced; "source" resolution silently becomes 1920×1080 in the composition path. | `ffmpeg.ts:317,322-337,690`; `composition-export.ts:73`. | Static: many decoders at once on long edited timelines; 60 fps captures halved; "source" is not source. | Segment-at-a-time mezzanine + concat, or a native compositor; probe real dimensions/fps. | L |
| H9 | **Subtitle burn-in ignores style** (plain SRT via `subtitles=`); preview has karaoke/boxed/pop. | `ffmpeg.ts:379`; `PreviewContent.tsx:288-306`. | Styled captions never reach output. | Emit ASS with `\k` tags (libass is present). | M |
| H10 | **Audio mix has no limiter/loudness**: `amix normalize=0`, volumes up to 4×. | `ffmpeg.ts:274,408,958`; no `alimiter/loudnorm` (measured absent per sub-report). | Hard clipping in export that the preview meter won't show. | `alimiter` + optional `loudnorm`. | S |
| H11 | **System audio on macOS is unverified.** Uses Electron `audio:"loopback"` with `useSystemPicker:false`; no `appendSwitch`/`enable-features` anywhere (measured: 0 hits); `NSScreenCaptureDescription` is not a standard Apple key; no `NSAudioCaptureUsageDescription`. Failure is silent (toggle flips off). | `desktop-permissions.ts:59-76`; `RecorderController.tsx:371-380`; `package.json:114-116`. | One of the four headline tracks may not work on Apple Silicon. Needs a real macOS run to settle. | Test on macOS 14/15; otherwise implement via SCK `capturesAudio`. | M |
| H12 | **GPLv3 FFmpeg (x264/x265) is bundled; MAS compatibility unresolved by upstream.** | `README.md:255-259`; `.github/ffmpeg-macos-sources.txt`; `prepare-ffmpeg.mjs:36-42`. | Cannot ship this binary in a Mac App Store build; patent exposure (H.264/HEVC) applies regardless. DMG distribution is handled via a checksummed source offer. | LGPL FFmpeg with VideoToolbox only (no x264/x265), or native AVFoundation encode; publish own source offer. | L |
| H13 | **Locked Electron 43.0.0 is flagged high by `npm audit`** (range `43.0.0-alpha.1 – 43.8.0`); also `zod <4.6.6`, `@modelcontextprotocol/sdk <=1.31.0`. | **Measured** `npm audit --package-lock-only --json` on 2026-11-15: 39 total (3 critical, 28 high, 8 moderate). Critical entries are `concurrently` / `shell-quote` (dev/build tooling). | Known advisories in the shell of the app. | Bump Electron to ≥ 43.8.1 (or current), zod, MCP SDK. | S |
| H14 | **Fork-critical upstream identity:** `publish.owner/repo`, `appId`, Team ID `3XX79RB95N` (`verify-mac-release.mjs:18`, `release.yml`) are upstream's. Left unchanged, a fork would auto-update from upstream. | `package.json:165-169`; `auto-updates.ts` `autoDownload:true`. | Wrong update channel / identity collision. | Retarget before any release. | S |

### 3.3 Medium

| ID | Finding | Evidence | Rec | Cx |
|---|---|---|---|---|
| M1 | `runAsNode:true` fuse exists only so MCP can be launched as `ELECTRON_RUN_AS_NODE=1 <app> server.js`; with `disable-library-validation` any same-user process can run JS under the signed binary. | `package.json:46`; `ai-connection.ts:84-89`; `build/entitlements.mac*.plist:7` | Add `--mcp` mode (or tiny helper), set `runAsNode:false`, drop the entitlement if native libs allow. | M |
| M2 | Gemini agent uploads the **entire raw recording** to Google Files API with only a passive consent sentence; no DELETE afterward. | `gemini-agent.ts:531-560`; `AiConnectionDialog.tsx:151` | Per-project consent + delete after session. | M |
| M3 | Provider keys: base64 **plaintext fallback** if keychain unavailable; `providers:reveal` hands plaintext to renderer despite header claim. | `provider-keys.ts:40,155`; `main.ts:880` | Refuse or consent; remove reveal. | S |
| M4 | 62 IPC channels; only a subset has validators; no `senderFrame` check. Bounded by registry lookups. | `main.ts:864-1534` | Per-channel schema + sender allowlist wrapper. | M |
| M5 | **AI `import_media` silently imports nothing** (preload drops non-dragged paths). Correct gate, broken feature. | `main.ts:1234-1247`; `preload.ts:185-199`; `operations.ts:176` | Main-side picker/consent grant; do not relax the gate. | M |
| M6 | No crash-safe export: writes directly to user's path; no `.part`+rename; `runProcess` lacks `-nostdin`. | `ffmpeg.ts:1026,1089`; `editor-export.ts` | `.part` rename, `-nostdin`. | S |
| M7 | Post-record remux/WAV conversion is serial, duplicates files, swallows remux errors. | `main.ts:1529-1560`; `ffmpeg.ts:149-209` | Parallelize, surface errors, APFS clone / delete originals. | S |
| M8 | `project.json` rewritten after every chunk (×4 tracks / 5 s); chunk copied Blob→ArrayBuffer→IPC→Buffer. | `project-store.ts:225-234`; `RecorderController.tsx:673` | Throttle flush; keep chunked design. | S |
| M9 | No `powerSaveBlocker`, no `backgroundThrottling:false`, no GPU switches (measured: 0 hits). | `src` grep | Prevent app suspension while recording. | S |
| M10 | Undo/redo covers only `timelineSegments` (49 steps); zoom/speed/text/layout/subtitle edits not undoable (inferred from absence). | `useTimelineEditing.ts:272-300` | Snapshot whole editor state. | M |
| M11 | No proxies; preview = up to 3 `<video>` + hidden `<audio>` per clip decoding VP9 in software; "low" preview still decodes the source. Thumbnails via hidden `<video>`, unbounded Map caches. Waveform is a seeded PRNG, not audio. | `PreviewContent.tsx:111/143/179`; `thumbnail-cache.ts:16-17`; `BezierAudioWaveform.tsx:25-27` | H.264 720p proxies, ffmpeg-generated peaks/thumbs, LRU. | L |
| M12 | ACE-Step music: 3.5B model, **fp32 on macOS**, unpinned `pip install --upgrade acestep`, several GB. | `acestep_generate.py:113-117`; `music-generation.ts:161` | Remove or gate on RAM; estimate ≥14 GB weights for fp32 (arithmetic). | S |
| M13 | Mac build target has no `arch` (host-arch); release builds `--x64 --arm64`; `onnxruntime-node` ships foreign-platform binaries (size not measured). | `package.json:118-122`; `release.yml:220` | Pin `arm64`, prune. | S |
| M14 | CI: actions pinned by tag not SHA; `permissions: contents: write` workflow-wide in release; no `npm audit`, no CodeQL/dependabot, no concurrency. | `ci.yml`, `release.yml:9-10` | SHA-pin, scope permissions. | S |
| M15 | Windows auto-update trust is only `latest.yml` sha512 from the repo (Windows unsigned). | `release.yml`, `auto-updates.ts` | Out of scope if Windows dropped. | — |
| M16 | No cursor/click/keystroke metadata captured; cursor baked into video. | grep of capture code (measured: no hits) | Capture cursor/click sidecar on same clock as H1; needs Input Monitoring. | L |
| M17 | `Access-Control-Allow-Origin: *` on media protocols. | `media-protocols.ts:83` (verified) | Echo app origin. | S |
| M18 | Packaged build honors `VITE_DEV_SERVER_URL` with full IPC; macOS DevTools locked, Windows not. | `main.ts:467` | Gate on `!app.isPackaged`. | S |
| M19 | Mic uses default Chromium constraints (echo cancel/NS/AGC), hurting mic + system-audio mixes (inferred defaults). | `recorder-utils.ts:31-77` | Explicit constraints. | S |

### 3.4 Low

- Fixed `fps=30`, no color tagging (`-colorspace/-color_trc` absent): possible untagged-output color shift vs. preview (inferred) — S.
- Resolution list caps at 1440p, no 4K (`ffmpeg.ts:853`) — S.
- Transition audio is a fade (`afade`), not `acrossfade` — M. Speed fixed to {1..5}× global range effect, no slow-mo/per-clip — M.
- Editor schema migration is v1→v2 only; add a migration registry before new required fields — S. Autosave debounce 1.5 s, no flush on quit — S.
- Sleep pauses recording but sync is not re-checked afterwards — M (part of H1).
- MAS security-scoped bookmarks present (129 lines) but `files.bookmarks.app-scope` entitlement missing; dead weight for a non-MAS fork — S.
- `THIRD_PARTY_NOTICES.md` covers only Inter and FFmpeg and cites v1.0.3 URLs; add generated license report — S–M.
- Missing fuses `enableCookieEncryption`, `grantFileProtocolExtraPrivileges:false` — M.
- Display border overlay (`display-overlay.ts`) is tested but hidden by the controller (`RecorderController.tsx:213-223`): dead UX.
- Window-capture picker uses SVG placeholders, no real thumbnails (`desktop-sources.ts:15-32`, `main.ts:1096`).
- No free-disk check before/during recording; no `statfs` use.
- Sync `readFileSync`/`existsSync` in main are small one-offs (not a concern).

---

## 4. What works / partial / missing / refactor / preserve

**Works (verified in code, not run):** chunked crash-tolerant append to disk; project folder layout & atomic JSON writes; path containment and UUID-gated imports; permission onboarding for screen/camera/mic status; cuts/split/ripple/sequencing; xfade transitions; text overlays; multi-track audio with delay; cancellable export jobs with progress/timeout; editor persistence with revision CAS; MCP stdio server for inspect/edit/analysis/export; SHA-pinned FFmpeg pipeline with Mach-O arch validation; cloud STT chunking with scratch cleanup; range-served media.

**Partial:** window capture (no thumbnails); system audio (unverified); pause/resume; subtitles (plain SRT only in export); hardware encode (H.264, fixed bitrate); resolution options; undo; AI media import; MCP `generate_music` (not verified end-to-end).

**Missing:** webcam/layout/background/corner export; per-track sync offsets; crash recovery; cursor/click metadata; proxies; real waveform; HEVC/ProRes/HDR; loudness normalization; per-clip speed; export queue; disk-space guard; e2e/IPC/protocol/capture tests; native macOS capture.

**Replace / refactor:** capture layer (MediaRecorder → native SCK helper); export compositor (ffmpeg layout math → shared geometry + GPU/native compositor); `ffmpeg.ts` (1,104 lines) into graph builder / encoder selection / process runner; Whisper (two pipelines → one quantized/native); renderer audio decode; ACE-Step (remove); MAS/security-scoped-bookmark code (remove unless shipping to MAS); `runAsNode` MCP launch; GPLv3 FFmpeg (→ LGPL VideoToolbox) for any App Store path.

**Absolutely preserve:** `src/shared/editor-domain/*` (operation-based, atomic validation, shared by UI/MCP/AI); project layout + atomic writes; `project-containment.ts` + protocol gating; chunked streaming to disk; `ExportJobRegistry`/`ffmpeg-progress.ts`; the SHA-pinned binary workflow and Mach-O validation; text-overlay wrap/metrics code; preview playback clock/sync logic; stdio-only MCP design; Electron window hardening (contextIsolation, nav/open handlers, CSP).

---

## 5. Recommended technical direction

**Keep the Electron editor and domain model; replace the capture and render back-ends with native/GPU pipelines, in this order.**

1. **Stabilize & de-risk (days):** bump Electron/zod/MCP SDK; arm64-only build; retarget publish/appId/Team ID; set recorder `powerSaveBlocker`; interim `avc1` MediaRecorder and 1080p/8 Mbps default; throttle `project.json` writes; `.part` exports; remove ACE-Step; one quantized Whisper.
2. **Fix correctness (weeks):** per-track start offsets + ffprobe alignment; crash recovery; `alimiter`; fps/resolution "source" truthfulness; bitrate scaling + `hevc_videotoolbox`.
3. **Close the preview/export gap (the core product risk):** extract layout geometry into a shared pure module and build an export compositor that draws screen + camera + background + corners. Prefer a native (Metal/CoreImage/AVFoundation) or WebGL/WebCodecs compositor over extending `-filter_complex`.
4. **Native capture:** a Swift helper (ScreenCaptureKit + AVAudioEngine/SCK audio + VideoToolbox → `.mov`/`.mp4`), writing timestamps and cursor/click sidecars on one clock.
5. **Licensing path:** LGPL FFmpeg (VideoToolbox) or AVFoundation encode, so a Store build is possible and patent/GPL exposure shrinks.

## 6. Five highest-priority risks

1. **Export ≠ preview (C1):** webcam/layout/background are not exported. Core value proposition is unmet.
2. **Capture architecture (H1, H2, H3, H11):** software VP9 MediaRecorder, no sync offsets, no crash recovery, unverified system audio — on an 8 GB machine.
3. **Memory ceilings (H4, H5, H8, M12):** whole-file renderer decode, two Whisper pipelines, per-segment decoders, fp32 3.5B music model.
4. **Known-vulnerable runtime + upstream identity (H13, H14, M1):** Electron 43.0.0 advisories; auto-update pointed at upstream; `runAsNode` + library-validation off.
5. **GPLv3 FFmpeg and tests that don't cover the risky parts (H12, §8):** unresolved MAS compatibility; no tests for capture, IPC, protocols, real export, or memory.

## 7. Measured vs. estimated

- **Measured (commands run):** git origin/branch/tag/release facts; file/line counts; `npm audit --package-lock-only` (39 vulns, 2026-11-15; a sub-investigation reported 35 with a different severity split — the figure here is the main agent's own run); presence/absence greps cited above; test-file and `it(` counts (78 files, 367 cases).
- **Estimated / static only:** every CPU, RAM, disk-rate and speed statement. **No benchmark was run.**
- **Not verifiable without installing/running:** Electron 43 loopback audio on macOS, VideoToolbox availability in the pinned FFmpeg, test pass/fail status, actual bundle size.

## 8. Repository state after audit

**Naming collision:** upstream already tracks an `AUDIT.md` (the owner's v1.0.2 audit, 402 lines, commit `69eb978`). It was accidentally overwritten once during this audit and was immediately restored with `git checkout -- AUDIT.md`; `git diff -- AUDIT.md` is empty. This document is therefore named `AUDIT.fork.md` (chosen by the user).

Test note: `composition-export.test.ts` and `editor-export.test.ts` DO run the real FFmpeg on tiny synthetic clips (320x180, 1-2 s); they require `npm ci` so the pinned binary exists. There is no realistic-workload export test.

New files only: `AUDIT.fork.md` (this file), `FEATURE_GAP_ANALYSIS.md`, `TEST_BASELINE.md`. Also present and not application code: `.codegraph/` (index), `.claude/settings.local.json` (Claude Code), `.atl/` (appeared during the session; not created by an explicit command of mine). The first fetch failed with an `fsync` error; a temporary local workaround (`core.fsync=none`, `core.fsyncMethod=writeout-only`) was used to complete the clone and has since been **removed**. Git writes with default settings were re-tested (`git hash-object -w` rc=0, `git fsck` clean), so the failure was transient. One unreferenced probe blob remains in `.git/objects` (harmless; `git prune` removes it).
