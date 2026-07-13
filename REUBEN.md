# REUBEN.md — Open Video Craft Full-Codebase Audit

**Version audited:** 1.3.1 (`main` @ `6283934`) · **Date:** 2026-07-12
**Scope:** every file in `src/main`, `src/preload`, `src/renderer`, `src/shared`, plus build config, CSP, entitlements, and CI. ~19.6k lines reviewed.

Severity legend: **P0** = fix before the next release (correctness/security), **P1** = fix soon (visible bugs, big perf wins), **P2** = worthwhile hardening/cleanup.

The overall architecture is genuinely good: context-isolated windows, a typed preload bridge as the single IPC surface, path-traversal-checked project store, atomic JSON writes, serialized per-project operation queues, and pure/testable timeline math. The findings below are the gaps.

---

## 1. Correctness bugs & accuracy

### 1.1 (P0) Preview audio is routed through CORS-tainted WebAudio — **confirmed silent (reproduced experimentally)**
`src/renderer/editor/audio-meter.ts:28` calls `createMediaElementSource()` on the preview `<video>`/`<audio>` elements. Those elements load `ovc-media://` / `ovc-import://` URLs, which are **cross-origin** to the page (file:// when packaged, http://127.0.0.1:5173 in dev), and none of them sets `crossOrigin`:

- `src/renderer/editor/PreviewContent.tsx:99,122,156` (`<video>` elements)
- `src/renderer/editor/TimelineAudioElements.tsx:16` (`<audio>` elements)

Per the WebAudio spec, a `MediaElementAudioSourceNode` fed by non-CORS cross-origin media **outputs silence**. Once `AudioMeter.connectElement` succeeds, the element's direct output is captured by the graph (and `element.volume` is forced to 1), so if the source is tainted, playback of mic/system audio, background music, and imported-video sound will be silent and the meter will read 0. Ironically `media-utils.ts:123-128` documents this exact taint problem for canvas capture and sets `crossOrigin = "anonymous"` there — but the playback elements never got the same fix.

**Reproduced (2026-07-12):** a minimal harness in this repo's own Electron 43 — identical `registerSchemesAsPrivileged` privileges, identical `net.fetch` + `ACAO: *` protocol handler, page loaded from `file://` like the packaged app — playing a 440 Hz WAV through `createMediaElementSource` → analyser:

| Variant | element plays? | WebAudio peak |
|---|---|---|
| no `crossOrigin` (current app code) | yes (`currentTime` advances, readyState 4) | **0.000 — silence** |
| `crossOrigin="anonymous"` | yes | 0.088 — audio flows |

Because `connectElement` reroutes the element's output into the graph and forces `element.volume = 1`, the taint means **audible silence in the app**, not just a dead meter.

**Fix:** add `crossOrigin="anonymous"` to all three places above (the protocol handlers already send `Access-Control-Allow-Origin: *`, so this is a one-line attribute per element). Then verify by ear in a packaged build: mic audio, an imported mp3, and an imported mp4.
*(Note: your own memory of the 1.1.0 audio work said "never reintroduce MediaElementSource on preview" — commit `6283934` reintroduced it.)*

### 1.2 (P0) Export does not include most of what the editor previews
`ExportVideoRequest` (`src/shared/types.ts:300`) carries only source/format/resolution/trim/volume/audio-levels/subtitle-sidecar. The ffmpeg pipeline (`src/main/ffmpeg.ts:117`) re-encodes the raw screen recording with scale/pad. Everything else the user edits is **preview-only and silently dropped on export**:

- Zoom effects, speed effects, timeline cuts/splits/moves (multi-clip timelines export only the raw screen track)
- Layout modes, camera bubble compositing, backgrounds, corner styles, screen position/scale
- Subtitle burn-in (only an `.srt` sidecar is written)

This is the single biggest accuracy gap in the product: the editor promises a composition the export doesn't deliver. Either (a) render exports through the real composition (offscreen canvas + `MediaRecorder`/WebCodecs, or an ffmpeg `filter_complex` graph that reproduces cuts/speed/zoom/overlay), or (b) clearly label the current behavior in the Export dialog ("exports the raw screen recording with trim + audio mix") so users aren't surprised. Recommend (b) immediately, (a) as the roadmap item.

### 1.3 (P1) Importing a file without an extension permanently breaks project saving
`file-dialogs.ts:84` derives `extension` from the filename ("All Files" is allowed, and extensionless files are common on macOS). `project-store.ts:663` rejects any import whose extension fails `/^[a-zA-Z0-9]{1,12}$/` — so `saveEditorState` throws, and the 1.5-second autosave (`useEditorPersistence.ts:413`) retries forever, surfacing an endless error banner with no way to recover except removing the import. Unicode extensions (e.g. `.mp4` typed with full-width chars) hit the same wall.
**Fix:** reject unsupported files at import time with a clear message, or fall back to a sniffed/`bin` extension instead of throwing at save time.

### 1.4 (P1) Closing the recorder during the 3-second countdown orphans a "recording" project
`recording:start` is invoked *before* the countdown (`RecorderController.tsx:410` → countdown at `:462`). If the user closes the recorder window during the countdown, `main.ts:200`'s close handler sends `recording:global-stop`, but the renderer ignores it (`stateRef` is `"countdown"`, not `"recording"/"paused"` — `RecorderController.tsx:176-183`). After 5s the window is force-destroyed and `activeRecordingProjectId` is cleared **without** `markFailed`, leaving a project stuck in status `"recording"` in the library forever.
**Fix:** handle global-stop in `countdown`/`preparing` states (cancel + discard), and make the 5s fallback in `main.ts:206` call `projectStore.markFailed` like the crash path does.

### 1.5 (P1) The 5-second force-close can truncate a recording
Same handler (`main.ts:206-212`): if flushing the final chunks + `recording:stop` + ffmpeg remux takes longer than 5s (large 4K chunk on a slow disk, AV scanning on Windows), the window is destroyed mid-stop and the project never reaches `stopRecording`/`prepareAudio` — status stays `"recording"`, mic/system WAVs never get created. Consider bumping the timeout, and/or having main wait on "stop acknowledged" rather than a fixed timer.

### 1.6 (P1) Wall-clock duration: sleep/lock inflates `durationMs`
`getCurrentRecordedDurationMs` (`RecorderController.tsx:654`) uses `Date.now()` deltas. If the machine sleeps mid-recording (lid close), the elapsed timer and the persisted `durationMs` include the sleep gap while MediaRecorder produced nothing — the editor then trusts `project.durationMs` for timeline math until real metadata loads (`useEditorDerivedData.ts:123`). Derive the final duration from the remuxed media (ffprobe or the `<video>` metadata you already read) instead of wall-clock, and listen for `powerMonitor` suspend/resume to auto-pause or at least mark the recording.

### 1.7 (P1) Camera/mic device unplugged mid-recording is not detected
Only the **screen** video track gets an `ended` listener (`RecorderController.tsx:451`). If a USB camera or mic is unplugged during recording, its track ends silently; depending on the platform the camera/mic file just stops growing while the UI keeps showing a healthy recording. Add `ended` listeners on camera/mic/system tracks → surface a warning or fail that track gracefully.

### 1.8 (P2) `stopRecording` durationMs is not validated in main
`project-store.ts:253` does `Math.max(0, Math.round(request.durationMs))` — `NaN`/`Infinity` pass through (`Math.round(NaN)` → `NaN`) and serialize as `null`. Harmless today, but add `Number.isFinite` for symmetry with the export validator.

### 1.9 (P2) Overlay border can vanish after a source-list refresh
`sources:list` clears `sourceCache` on every call (`main.ts:605`). A `display-metrics-changed` refresh (`main.ts:579`) that fires after a re-list with new source ids finds the old id missing and closes the border even though the display is still there. Cache per-listing generation, or re-resolve by `display_id` instead of capture-source id.

### 1.10 (P2) SRT sidecar output isn't SRT-safe
`writeSubtitleSidecar` (`main.ts:1062`) writes subtitle text verbatim. A subtitle containing a blank line ends the cue early, and a line that looks like `12:34:56,789 --> ...` corrupts the file. Also the sidecar silently overwrites an existing `.srt` next to the chosen output. Strip/collapse internal blank lines and use CRLF (`\r\n`) for maximum player compatibility.

### 1.11 (P2) Export path extension append can silently overwrite
`chooseExportPath` (`file-dialogs.ts:113`) appends `.mp4`/`.webm`/`.mov` **after** the OS save dialog ran its overwrite check — saving as `video` when `video.mp4` already exists overwrites it with no prompt.

### 1.12 (P2) `formatDuration` has no hours
`recorder-utils.ts:222` renders a 90-minute recording as `90:00`. Cosmetic, but recordings longer than an hour are a supported case.

---

## 2. Performance / speed

### 2.1 (P1) The whole editor re-renders 30–60×/sec during playback, and every render stringifies the whole project
`currentTime` is React state ticked from the rAF loop (`useEditorPlayback.ts:222` — every 33ms, 16ms while a zoom is active). Every tick re-renders `EditorView` and its entire subtree. On top of that, `useEditorPersistence.ts:321-350` builds a full snapshot and `JSON.stringify`s it (segments + subtitles + effects — easily tens of KB) **unconditionally on every render**, including all playback ticks.

Fixes in order of value:
1. Wrap snapshot + signature in `useMemo` keyed on the actual state values (none of them change during playback) — one-line-ish, kills the stringify burn.
2. `React.memo` the heavy children (`EditorTimelineSection`, `EditorToolPanel`, `MediaPanel`) and pass stable/memoized style objects (`screenStyle`/`previewFrameStyle` in `useEditorDerivedData.ts:225,307` are rebuilt every tick, defeating memo today).
3. Longer term: drive the zoom/pan transform and playhead line imperatively (refs + rAF) instead of via React state, and drop the tick rate of state updates to ~10Hz for everything else.

### 2.2 (P1) Run Whisper off the main thread
`useSubtitleGeneration.ts:62` runs transformers.js in the renderer main thread. Without cross-origin isolation, onnxruntime-web is single-threaded WASM — transcription of long audio will peg the UI for minutes and the whole editor jank-freezes. Move the pipeline into a Web Worker (CSP already allows `worker-src 'self' blob:`), and pass `device: "webgpu"` with a WASM fallback — 5–10× faster on machines that support it. Also note the first run downloads ~145MB from huggingface.co; surface an explicit "requires network" hint for offline users (the progress UI exists but the failure mode is just an error toast).

### 2.3 (P1) Give ffmpeg jobs progress, cancellation, and a leash
`ffmpeg.ts:264` `runProcess` has no timeout, no kill on app quit, and no progress. A corrupt input hangs the export forever with a spinning dialog the user can't cancel (`ExportDialog` blocks close while `exporting`). Also `stderr` accumulates unbounded into a string (ffmpeg writes continuous stats lines) — add `-hide_banner -loglevel error`, or cap the buffer.
**Do:** pass `-progress pipe:1`, parse `out_time_ms` against the known duration to drive a real progress bar, keep a handle to the child to support a Cancel button, and kill children in `app.on("will-quit")`.

### 2.4 (P1) Use hardware encoders for export
`createCodecArgs` (`ffmpeg.ts:217`) always uses software `libx264 -preset medium` / `libvpx-vp9`. The bundled ffmpeg-static supports `h264_videotoolbox` (macOS) — probe for it and use it for mp4/mov (5–15× faster on Apple Silicon). On Windows, probe `h264_nvenc` / `h264_qsv` / `h264_amf` in that order and fall back to libx264. Also: when `resolution === "source"`, format is mp4/mov, there's exactly one audio decision and no filters needed, a `-c copy`-style remux path would make trims near-instant (stream copy with `-ss` keyframe caveats — use `-c:v copy` only when trimStart is 0).

### 2.5 (P2) `project.json` is rewritten (atomically) on **every** chunk of **every** track
`appendChunk` (`project-store.ts:223-232`) appends the media chunk and then rewrites the full project JSON — with 4 tracks at 5s timeslices that's ~0.8 writes+renames/sec for the whole recording, and all four tracks serialize through one per-project queue (a big screen chunk delays mic writes). Throttle the metadata write (e.g. every 10s or on byte-count deltas) and let chunk appends for *different tracks* run in parallel (per-track queues already exist renderer-side).

### 2.6 (P2) Whole-file memory loads for waveforms and STT
`loadWaveSurferBlob` (`media-utils.ts:275`) fetches the entire audio file into memory; `decodeAudioTo16kMono` (`media-utils.ts:318`) decodes the full track into Float32 (~230MB/hour after downmix, plus the decoded AudioBuffer peak). Fine for short clips; for hour-long recordings expect several-hundred-MB spikes. Consider wavesurfer peaks precomputation (ffmpeg `-filter_complex aformat=...,astats`/`audiowaveform`-style sidecar) and chunked decode for STT.

### 2.7 (P2) First save after import copies the file; use clones
`persistEditorImport` (`project-store.ts:471-475`) copies imported media into the project with `fs.copyFile`. On APFS pass `fs.constants.COPYFILE_FICLONE` (instant copy-on-write clone, falls back automatically); on Windows there's no clone but at least the copy happens once (the returned state re-points the cache at the internal copy — good design, verified).

### 2.8 (P2) `projects:list-recent` re-reads every project.json on every launcher view
`ProjectLibrary.listRecentUnlocked` (`project-library.ts:32`) stats+reads every project folder each call (and `get()` funnels through it too, so deleting one project re-scans all). Cheap for 10 projects, slow on 200 or on network/OneDrive folders. Cache by mtime or refresh lazily. The library also grows unbounded — consider capping recent entries.

### 2.9 (P2) Recorder encodes VP9 at up to 24 Mbps in software
`quality.ts:18` "Native (full)" + VP9 at 30fps on a 5K display is a lot of realtime software encode (Chromium's VP9 encoder), especially on midrange Windows machines — dropped frames show up as stutter in recordings. Probe `MediaRecorder.isTypeSupported("video/mp4;codecs=avc1")`/`video/webm;codecs=h264` (hardware-accelerated in recent Chromium) and prefer it for the "source" tier, or expose an "H.264 (faster)" toggle.

---

## 3. Security

Posture is strong for an Electron app: `contextIsolation: true`, `nodeIntegration: false`, default renderer sandbox (never disabled), typed `contextBridge` API only, `setWindowOpenHandler` deny + same-origin `will-navigate` guard (`main.ts:1250`), permission request handler restricted to app windows and media/display-capture only (`desktop-permissions.ts:41`), path-traversal checks on every project path (`project-store.ts:370`), `app:open-external` restricted to http(s) (`app-status-ipc.ts:24`), meta CSP present. Remaining items:

### 3.1 (P1) CSP: make custom schemes explicit and drop the remote image hole
`index.html:6`:
- `connect-src` doesn't list `ovc-media:`/`ovc-import:` even though renderer `fetch()` depends on them (waveforms, STT decode, thumbnails). It evidently works today, but you're relying on unspecified custom-scheme CSP behavior — add both schemes explicitly so a Chromium tightening doesn't break waveforms/STT overnight.
- `img-src ... https://images.unsplash.com` exists only for the six "real-world" editor backgrounds (`backgrounds.ts`). That's a privacy beacon (Unsplash sees usage/IP), a hard offline failure (background renders black), and an unnecessary remote-content hole in a desktop app. **Bundle the six images** (they're already licensed for this) and remove the remote origin from CSP.
- `script-src 'self' blob: 'wasm-unsafe-eval'` — needed for onnxruntime; fine, but re-check whether `blob:` in *script-src* (vs worker-src) is still required after moving STT to a worker.

### 3.2 (P1) Validate the remaining IPC payloads in main
`assertExportVideoRequest` and `assertSaveEditorProjectStateRequest` are good; these are not validated:
- `recording:start` (`main.ts:908`) — `request` flows into `project.json` unchecked (`source`, `devices`, `tracks.*.mimeType` are arbitrary renderer strings).
- `recording:write-chunk` (`main.ts:919`) — `track` is only checked by map lookup (`recordingTrackToMediaTack[track]` → `undefined` → throws, OK), but `chunk` size is unbounded per message; consider a sanity cap (e.g. 256MB) so a bug can't balloon memory.
- `projects:create` (`main.ts:886`) — `baseDirectory` is an arbitrary path from the renderer, bypassing the folder dialog. A compromised renderer could write project folders anywhere the user can. Track dialog-granted directories in main (like `importedMediaCache` does for files) and only accept those.
- `projects:get` / `editor:load-project-state` / `ffmpeg:prepare-audio` — `projectId` is fine (map lookup), no action needed.

These are defense-in-depth (the renderer is sandboxed and local-only), but they're the standard bar for Electron main processes.

### 3.3 (P2) Tighten macOS entitlements
`build/entitlements.mac.plist` grants `allow-jit`, `allow-unsigned-executable-memory`, **and** `disable-library-validation`. Modern Electron needs only `allow-jit` (plus `allow-unsigned-executable-memory` only for Electron < 20-era). You ship no native modules and ffmpeg runs as a separate signed-inherit process — try dropping `allow-unsigned-executable-memory` and `disable-library-validation` in a notarized test build; every dropped entitlement shrinks the code-injection surface.

### 3.4 (P2) Set Electron fuses at package time
No `@electron/fuses` config exists. Flip the standard ones for packaged builds: `RunAsNode=off`, `EnableNodeCliInspectArguments=off`, `EnableNodeOptionsEnvironmentVariable=off`, `OnlyLoadAppFromAsar=on`. This closes the "run the shipped binary as a generic Node interpreter" hole and is a 20-line electron-builder `afterPack` hook.

### 3.5 (P2) Windows binaries are unsigned
`release.yml` signs/notarizes macOS but Windows has no `CSC_LINK` — users get SmartScreen warnings and electron-updater's on-disk verification is weaker without a publisher certificate (transport is HTTPS-to-GitHub, which is decent). Budget permitting, use Azure Trusted Signing or an OV cert; also consider `verifyUpdateCodeSignature` once signed.

### 3.6 (P2) `projects:delete` trusts `projects.json` content
`main.ts:838-873` reads `rootPath` from the user-writable library file and (after a confirm dialog that does show the path — good) falls back from `shell.trashItem` to `fs.rm(recursive, force)`. If anything ever tampers with `projects.json`, the fallback is a recursive delete of an arbitrary path. Suggest: validate the folder actually contains a `project.json` whose id matches before deleting, and consider dropping the permanent-delete fallback (trash fails are rare; tell the user instead).

### 3.7 (P2) `ovc-import://` serves any registered absolute path with `ACAO: *`
By design (`media-protocols.ts:60`), and registration only happens via the user's file dialog or validated project-internal paths — good. Keep it that way; document the invariant in the file header so a future "register path over IPC" convenience doesn't sneak in.

### 3.8 (P2) ffmpeg-static licensing
The bundled ffmpeg-static binary is a GPL build; the app is ISC. Distributing it is fine only if you comply with GPL distribution terms for the binary (offer source/attribution). Add a licenses/about note — or switch to an LGPL ffmpeg build without libx264 (would require the hw-encoder work in 2.4 anyway, since x264 is the GPL part).

---

## 4. Missed edge cases (quick hits)

| # | Edge case | Where | What happens today |
|---|---|---|---|
| 4.1 | Disk full mid-recording | `queueChunkWrite` → `appendChunk` | Reactive fail (good), but no preflight free-space check or low-space warning for long recordings |
| 4.2 | Project folder on OneDrive/Dropbox/AV-scanned dir (Windows) | `writeJsonFileAtomic` rename | `EPERM/EBUSY` when the target is briefly locked → save error; add a small retry (3× with backoff) around the rename |
| 4.3 | `beforeunload` with dirty state | `useEditorPersistence.ts:419` | In Electron there's **no native dialog** — the window just silently refuses to close during the ≤1.5s dirty window; use a real `dialog.showMessageBox` flow via IPC if you want a prompt |
| 4.4 | Two clips of the same import + `words` arrays on hundreds of subtitles | persistence snapshot | Works, but signature stringify cost grows — covered by 2.1 |
| 4.5 | `trimStart` beyond the end of the video | export validator | Passes validation (`>= 0` only); ffmpeg produces a 0-frame file or errors — clamp against known duration in the dialog |
| 4.6 | Zero-byte/garbage media file imported | editor `<video>` error | Playback watchdog catches stalls (good), but there's no per-item "failed to load" badge in the media grid |
| 4.7 | System-audio loopback unsupported (macOS 12, some Linux) | `RecorderController.tsx:341-349` | Falls back to video-only capture — good — but the toggle silently flips off; toast/log why (memory note: this path is still runtime-unverified on macOS) |
| 4.8 | App quit while ffmpeg export runs | `runProcess` | Orphaned ffmpeg keeps burning CPU and writes a half file — covered by 2.3 |
| 4.9 | Sleep during *editor* playback | AudioContext | The context can end up `suspended`/`interrupted` after resume; playback continues silently until the next explicit play toggle (`resume()` only runs there) — resume on `visibilitychange`/`focus` too |
| 4.10 | Editor opened for a project still status `"recording"` | `getProjectForEditor` | Loads with 0-byte media and NaN-ish durations; guard with a friendly "still recording/failed" state |
| 4.11 | `createDefaultProjectFolderName` collision race | `getAvailableFolderName` | TOCTOU if two creates race the same second — trivial, but `mkdir` with `recursive:true` won't error; use exclusive create if you care |
| 4.12 | Subtitles overlapping trim boundaries | sidecar export | Handled correctly (clamped, filtered) — ✅ verified, no action |
| 4.13 | HiDPI mixed-DPI multi-monitor border (Windows) | `display-overlay.ts` | Handled (DIP math + per-scale thickness) — ✅ has unit tests |

---

## 5. Windows vs macOS — what the app must know per platform

The per-platform code is mostly in good shape; this is the definitive checklist with the gaps called out.

| Concern | macOS | Windows | Status |
|---|---|---|---|
| Screen permission | TCC preflight + settings deep-links + guide overlay | No preflight concept; capture picker grants | ✅ handled (`desktop-permissions.ts`) |
| Cam/mic permission | `askForMediaAccess` | **Gap:** Win 10/11 privacy toggles can deny `getUserMedia` even though app-level status reads "unavailable" — map `NotAllowedError` to a "check Windows privacy settings" message (`ms-settings:privacy-microphone` deep link works via `shell.openExternal`) | ⚠️ P2 |
| Recording border | Opaque content-protected strips (transparent+protected = black-screen macOS bug) | Single transparent click-through window, `WDA_EXCLUDEFROMCAPTURE` | ✅ handled + documented |
| System audio loopback | Requires macOS 13+ (ScreenCaptureKit) | Native loopback | ✅ fallback exists; ⚠️ still runtime-unverified on macOS (4.7) |
| App menu | **Bug (P1):** `Menu.setApplicationMenu(null)` (`main.ts:1282`) removes all menu key-equivalents on macOS — **Cmd+C/V/X/A stop working in text inputs** (subtitle editing, project search) and Cmd+Q/Cmd+W/Cmd+H die too. Build a minimal menu with `role` items (appMenu + editMenu + windowMenu) on darwin; keep `null` on Windows (autoHideMenuBar already set) | `null` is fine | ❌ fix |
| Auto-update | dmg/zip + Squirrel.Mac, signature-verified; `latest-mac.yml` race documented in release flow | NSIS + blockmap differential; **portable .exe never auto-updates** (expected, but say so in README); artifactName has no spaces (previously broke latest.yml — keep it that way) | ✅ mostly; ⚠️ unsigned (3.5) |
| Paths | Slash-normalized relative paths in project.json for cross-OS portability | Drive-letter/UNC absolute-path smuggling blocked by `resolveProjectFile` (verified: `C:evil`, `..\`, UNC all rejected) | ✅ |
| Global shortcut | `Cmd+Shift+S` | `Ctrl+Shift+S` — collides with common app shortcuts (e.g. "save as" in browsers is fine since we're focused-agnostic, but it's *global*: it fires while other apps are focused). Make it configurable or at least release it when not recording (already done — registered only during recording ✅) | ✅/⚠️ document |
| DPI | Retina scale — DIP everywhere | Mixed-DPI strip math + 150–200% scaling handled | ✅ tested |
| Arch targets | x64 + arm64 dmg/zip (universal script exists but release builds two) | **x64 only** — no Windows-on-ARM build; fine, but note it (Snapdragon laptops run x64 emulation, slower capture encode) | ⚠️ document |
| Window minimize (frameless, always-on-top) | n/a quirk | skipTaskbar/alwaysOnTop relaxed during minimize and restored on `restore` | ✅ handled |
| Sleep/lock during recording | `powerMonitor` not used — duration drift (1.6) + no auto-pause | same | ❌ both platforms |
| ffmpeg binary | asarUnpack'ed per-arch binary, ENOTDIR workaround | same + `windowsHide: true` | ✅ |

---

## 6. Prioritized action list

**P0 — before the next release**
1. Add `crossOrigin="anonymous"` to preview/timeline media elements; verify audio + meter in a packaged build (1.1).
2. Label export behavior honestly in the Export dialog (1.2, the disclosure half).

**P1 — next sprint**
3. Restore a minimal macOS application menu with edit roles (§5 menu bug — copy/paste is broken on macOS today).
4. Memoize the persistence snapshot; `React.memo` the timeline/tool panels (2.1).
5. Import-time rejection of unsupported/extensionless files (1.3).
6. Countdown-state stop handling + `markFailed` in the 5s force-close path; consider raising the timeout (1.4, 1.5).
7. ffmpeg progress + cancel + quit-kill + `-loglevel error` (2.3); hardware encoder probe (2.4).
8. Whisper → Web Worker (+ WebGPU when available) (2.2).
9. Track `ended` on camera/mic/system tracks (1.7); duration from media, not wall clock (1.6).
10. CSP: add `ovc-media:`/`ovc-import:` to `connect-src`, bundle the Unsplash backgrounds and drop the remote origin (3.1).

**P2 — hardening backlog**
11. Validate `recording:start` payload + dialog-granted `baseDirectory` allowlist (3.2).
12. Electron fuses (3.4); entitlement diet (3.3); Windows code signing (3.5).
13. Throttle `project.json` chunk-write rewrites; per-track append queues (2.5).
14. Atomic-rename retry for OneDrive/AV locks (4.2); free-space preflight (4.1).
15. SRT sanitization + CRLF, overwrite prompt for appended extension (1.10, 1.11).
16. `projects:delete` root-path validation, drop permanent-delete fallback (3.6).
17. ffmpeg licensing note or LGPL build (3.8). Recent-projects cache + cap (2.8).

**Testing gaps worth closing** (current suite covers the pure utils well): project-store editor-import validation paths (extensionless case would have been caught), export request assertion table tests, an Electron smoke E2E (launch → record 3s fake source → editor loads → export) via Playwright's Electron driver on both OS runners — CI currently unit-tests on Ubuntu only while shipping mac+win.
