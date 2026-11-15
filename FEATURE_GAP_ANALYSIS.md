# FEATURE GAP ANALYSIS — Open Video Craft → macOS-first fork

- **Baseline:** `main` @ `143a0d6` (v1.0.6, unreleased; latest stable release `v1.0.5`). Audit date 2026-11-15. Read-only, nothing executed.
- **Method:** every README claim (`README.md:76-114`) was traced to code. "Verified" = implementation read at the cited path; **nothing here was run**, so "works" means "implemented as designed", not "tested on hardware".
- **Target:** lightweight, high-quality recorder/editor for Apple Silicon Macs with 8 GB RAM.
- Companion documents: `TEST_BASELINE.md` (test inventory). The consolidated audit is `AUDIT.fork.md` (upstream's own `AUDIT.md`, a v1.0.2 audit, is untouched).

Status key: ✅ implemented & consistent with README · 🟡 partial · ❌ missing/contradicted · ❓ unverifiable without running on macOS.

---

## 1. README claims vs. verified implementation

### Recording

| README claim | Status | Verified behavior (evidence) |
|---|---|---|
| Floating always-on-top recorder, pause/resume, countdown, pill mode | ✅ | `main.ts:371` (alwaysOnTop), `RecorderController.tsx:299-324` pause/resume via `MediaRecorder.pause()`, `runCountdown` in `recorder-utils.ts`. Pause duration uses wall-clock segments; per-track gap drift is unaddressed (inferred). |
| Screen, camera, mic, **system audio** as separate tracks | 🟡 / ❓ | Screen/camera/mic = ✅ (`recorder-utils.ts`). System audio = Electron `audio:"loopback"` (`desktop-permissions.ts:59-76`); no `appendSwitch`/feature flag anywhere in `src`; failure is silent (`RecorderController.tsx:378-380`). Needs a real macOS 14/15 run. |
| Selected display identified without a display-sized overlay | 🟡 | `display-overlay.ts` computes geometry and is tested, but the controller hides it (`RecorderController.tsx:213-223`). Window capture has no real thumbnails (SVG placeholder, `main.ts:1096`). |
| Media written in chunks; limits data loss after interruption | 🟡 | Chunks append to `media/*.webm` every 5 s (`project-store.ts:225`) ✅. **No startup recovery** for `recording`/`processing` projects; raw WebM lacks duration/cues, so data survives but isn't repaired. |
| Recorder crashes / failed device acquisition don't wedge the app | ✅ (static) | Error/discard paths at `RecorderController.tsx:506-509, 616-637`; window-close path `main.ts:404-420`. Not exercised by tests. |

### Editing

| README claim | Status | Verified behavior |
|---|---|---|
| Multi-lane timeline (video, audio, zoom, speed, subtitles) | ✅ | `src/shared/editor-domain/*`, renderer `timeline-*`. |
| Export-correct crossfade / fade-black / slide-left / wipe-left | ✅ | `xfade` at `ffmpeg.ts:~733`. Transition **audio** is a plain `afade`, not `acrossfade` (`ffmpeg.ts:400-403`) → audible dip. |
| Move/trim/split/delete/copy-paste with undo/redo | 🟡 | Ops work (`timeline-move`, `-clipboard` tests). **Undo/redo snapshots `timelineSegments` only** (49 steps, `useTimelineEditing.ts:272-300`); zoom/speed/text/layout/subtitle edits are not undoable (inferred from absence of other stacks). |
| Zoom-in with adjustable focal point; speed up to 5× | 🟡 | Zoom works in preview and export (`ffmpeg.ts:473-489`) but the export filter is per-frame upscale→crop (heavy; bounds only enforced in `operations.ts:207`). Speed is `1\|2\|3\|4\|5` global range effect (`types.ts:32`); no slow-motion, no per-clip speed. |
| **Camera layouts, draggable screen/camera, backgrounds, corner styling** | ❌ (export) / ✅ (preview) | **Preview-only.** Zero `camera`/`layoutMode`/`backgroundStyle`/`cornerStyle` references in `composition-export.ts`, `editor-export.ts`, `ffmpeg.ts` (measured). `composition-export.ts:41-48` registers only screen, mic, system audio, imports. README itself says so at lines 113-114; `server.ts:256` also declares `cameraCompositing:false, layouts:false`. |
| **Multilingual on-device Whisper subtitles, auto language detect, word-level karaoke** | 🟡 | Transcription exists, but (a) two separate Whisper pipelines (renderer wasm single-thread + main `onnxruntime-node`), (b) renderer decodes whole files into RAM (`media-utils.ts:320-345`), (c) **karaoke styling never reaches the exported file** — burn-in is plain SRT (`ffmpeg.ts:379` vs `PreviewContent.tsx:288-306`). Model is fetched from Hugging Face at runtime, unpinned ("on-device" after first download only). |
| Per-lane mute/volume with "the same mix used for preview, transcription, and export" | 🟡 | Three separate implementations: WebAudio (preview), renderer `decodeTimelineAudioMix` (transcription), ffmpeg `amix normalize=0` (export). Export has no limiter; volumes up to 4× (`ffmpeg.ts:274,408,958`) can clip in export while the preview meter looks fine. |
| Debounced autosave, dirty-state protection, safe recovery from invalid `editor.json` | ✅ | `useEditorPersistence.ts`, `editor-document-store.ts` (revision CAS, lock file), tests `editor-document-safety`, `editor-persistence-flush`. Last ≤1.5 s of edits can be lost on crash (no flush-on-quit, inferred). |
| Export MP4/WebM/MOV at **source**, 720p, 1080p, 1440p | 🟡 | `source` returns `null` from `getResolutionDimensions` (`ffmpeg.ts:853-862`) and the **composition path substitutes 1920×1080** (`ffmpeg.ts:317`). Output fps is forced to 30 (`ffmpeg.ts:690`). No 4K. |
| Local MCP server + Gemini so an AI agent can inspect/edit the complete project | 🟡 | MCP stdio server is solid for inspect/edit/analysis/export (`src/mcp/server.ts`). **`import_media` queued by the agent is silently dropped** (preload path-grant gate, `main.ts:1234-1247`, `preload.ts:185-199`). "Complete project surface" ≠ export surface (see layout row). Gemini uploads the whole raw recording to Google with passive consent. |

### Platform / distribution claims

| Claim | Status | Evidence |
|---|---|---|
| macOS (Apple Silicon) supported | 🟡 | Builds exist, but `mac.target` has no `arch` (`package.json:118-122`), release builds x64+arm64 (`release.yml:220`), the packaged FFmpeg is third-party GPLv3, and the capture/encode path is Chromium software VP9. |
| Local-first, no required account/upload | ✅ with caveats | Cloud STT, Gemini and Lyria are optional; model download and `pip install acestep` happen at runtime. |
| Mac App Store build | ❓ | README (`:255-259`) states GPLv3 FFmpeg compatibility is unresolved. Not a v1 concern for a DMG fork. |

---

## 2. Gaps against OUR objectives (what the fork must add or change)

Priority: **P0** blocks the product promise · **P1** needed for 8 GB / quality targets · **P2** polish. Complexity: S ≤1 d, M 2–5 d, L 1–3 wk, XL >3 wk.

| # | Capability | Today | Gap | Pri | Cx |
|---|---|---|---|---|---|
| 1 | Export matches preview (camera, layout, background, corners, styled subs) | Preview only | Shared geometry module + export compositor; styled ASS/native subtitle rendering | P0 | XL |
| 2 | Native macOS capture | Chromium `getDisplayMedia` + `MediaRecorder` VP9 WebM | Swift helper: ScreenCaptureKit video + system/app audio, AVFoundation cam/mic, VideoToolbox HEVC/H.264 → `.mov` | P0 | XL |
| 3 | Synchronized multi-track capture | One `startedAt`; all tracks placed at 0 | Per-track `startOffsetMs`, common clock, ffprobe alignment, re-check after sleep | P0 | M |
| 4 | Crash-safe recording | Append-to-disk only | Launch-time recovery (remux, probe, mark `recovered`) | P1 | M |
| 5 | Interim capture efficiency (before native helper) | VP9, ≤24 Mbps, 4 recorders | `avc1` MediaRecorder if supported; 1080p/8 Mbps default; `powerSaveBlocker`; disk-space guard | P1 | S |
| 6 | Memory-bounded transcription | Whole-file renderer decode; 2 resident Whisper pipelines | One quantized pipeline (or whisper.cpp Metal/CoreML), streamed windows, disposed after use, pinned/bundled model | P1 | M–L |
| 7 | Hardware-accelerated export | `h264_videotoolbox` @ fixed 8 Mbps, software filtergraph | Bitrate scaling, `hevc_videotoolbox`, `-hwaccel`, build-time encoder assertion, zoom crop-then-scale, segment-wise render | P1 | S–L |
| 8 | Smooth preview on 8 GB | Up to 3 `<video>` per clip decoding VP9 in software; unbounded thumbnail caches; fake waveform | H.264 720p proxies, ffmpeg peaks/thumbs, LRU | P1 | L |
| 9 | Cursor/click intelligence (auto-zoom, highlights) | None; cursor baked in | Cursor+click sidecar on shared clock (needs Input Monitoring) | P2 | L |
| 10 | Audio quality | `amix normalize=0`, no limiter | `alimiter`, optional `loudnorm`, explicit mic constraints, `acrossfade` | P1 | S |
| 11 | Honest export settings | "source" → 1080p; fps forced 30; no 4K; no color tags | Probe real dims/fps; add 4K; tag bt709 | P1 | S |
| 12 | Full undo | Segments only | Whole-state snapshots | P2 | M |
| 13 | AI import & consent | `import_media` dropped; whole-file Gemini upload | Main-side consent grant; per-project upload consent + DELETE | P2 | M |
| 14 | Licensing / Store viability | GPLv3 FFmpeg | LGPL FFmpeg (VideoToolbox) or AVFoundation encode; own source offer | P1 (if Store/commercial) | L |
| 15 | Fork identity & update channel | Upstream `publish`, appId, Team ID | Retarget everything before first build | P0 (ops) | S |
| 16 | Dependency hygiene | 39 advisories (`npm audit`, 2026-11-15) incl. Electron 43.0.0 | Bump Electron/zod/MCP SDK; CI audit; SHA-pinned actions | P0 (ops) | S |
| 17 | Test safety net | Pure-logic units only | Capture/sync, IPC, protocol, real-ffmpeg e2e, memory budgets (see `TEST_BASELINE.md`) | P1 | L |

---

## 3. Remove / de-scope candidates (for an 8 GB macOS-only fork)

- **ACE-Step local music** (3.5B model, fp32 on macOS, unpinned `pip install`, several GB): remove or gate on RAM.
- **Windows code paths and NSIS/portable targets**; **x64 FFmpeg and x64 release slice** (keep only if Intel is required).
- **MAS/security-scoped-bookmark machinery** (`security-scoped-resources.ts`, MAS profile scripts) unless a Store build is planned.
- **Main-process Whisper (`onnxruntime-node`)** if transcription moves native — also drops a foreign-platform native payload.
- `runAsNode` fuse + `disable-library-validation` once MCP launches via an in-app `--mcp` mode.

## 4. Preserve

Editor domain (`src/shared/editor-domain/*`), project layout and atomic writes, containment + protocol gating, chunked streaming to disk, `ExportJobRegistry` and progress parsing, SHA-pinned binary pipeline with arch validation, stdio-only MCP design, window hardening/CSP, text-overlay wrap code, playback clock/sync decision logic.

## 5. Caveats

- No performance number in this document is measured. Memory/CPU/disk statements are static analysis or arithmetic.
- Claims about Electron 43 / Chromium runtime behavior on macOS (system-audio loopback, `avc1` MediaRecorder support, VideoToolbox availability in the pinned FFmpeg) require running on a Mac and are marked ❓.
