# Open Video Craft — Code Audit Findings

**Date:** 2026-07-11 · **Version audited:** 1.1.3 (commit `b154397`)
**Scope:** full source tree (`src/main`, `src/preload`, `src/renderer`, `src/shared`), tests, build config, CI workflow, dependencies.
**Baseline health:** typecheck passes, all 43 tests pass, zero `any` casts, zero TODOs, no stray `console.log`s.

---

## What is already good

Worth stating so it doesn't get lost: this is a well-structured codebase.

- Every renderer window runs with `contextIsolation: true`, `nodeIntegration: false`, and a single typed preload bridge (`src/preload/preload.ts`).
- Path traversal is properly blocked in `ProjectStore.resolveProjectFile` (`src/main/project-store.ts:370`), and import metadata is validated with strict regexes before touching disk.
- FFmpeg is spawned with argument arrays, never a shell — no command injection surface (`src/main/ffmpeg.ts:264`).
- All JSON persistence is atomic (temp file + rename), and per-project operations are serialized through a queue (`runProjectOperation`).
- The permission request handler only grants media/display-capture to app-owned windows (`src/main/desktop-permissions.ts:41`).
- Comments consistently explain *why* (platform quirks, race conditions), and the editor is decomposed into focused hooks with a documented file map.

---

## Critical

### C1. Export ignores almost everything the editor shows (WYSIWYG gap)
`src/renderer/editor/useEditorExport.ts:82` and `src/main/main.ts:933` / `src/main/ffmpeg.ts:117`

The `ExportVideoRequest` carries only: source, format, resolution, trim start/end, master volume, background-audio import ids. Everything else the editor previews is silently dropped from the exported file:

- **Zoom effects** — preview-only
- **Speed effects** — preview-only
- **Subtitles** (including Whisper transcriptions the user waited to generate) — never burned in, and there's no `.srt`/`.vtt` sidecar export either
- **Layout, backgrounds, corner styles, aspect ratio, screen position** — preview-only
- **Camera track** — never composited; `resolveExportSource` (`src/main/main.ts:968`) exports only the screen video
- **System audio** — never exported: `resolveExportSource` picks `micWav ?? micWebm` only; the `systemWav` track that the app records and remuxes is unreachable from export
- **Timeline cuts / splits / reordering** — preview-only; only the single trim range survives
- **Per-track audio levels/mutes** — background audio is hardcoded to `0.55` volume in `ffmpeg.ts:138`

This is the single biggest flaw in the product: a user edits for an hour, exports, and gets roughly the raw screen recording with a trim. Recommendation, in order of effort:

1. **Short term:** make the export dialog list exactly what will/won't be included, and add subtitle sidecar export (`.srt`) — that part is pure text generation.
2. **Medium term:** render exports through the same compositing the preview uses — capture the preview `<canvas>`/DOM composition via a hidden renderer playing in real time into a `MediaRecorder`, or
3. **Long term:** translate the edit graph into an ffmpeg `filter_complex` (zoompan/setpts/overlay/subtitles filters). Harder, but produces faster-than-realtime exports.

### C2. No autosave and no unsaved-changes guard in the editor
`src/renderer/editor/useEditorPersistence.ts:311`

Saving happens only on explicit Cmd/Ctrl+S or the Save button. There is:

- no periodic autosave,
- no dirty-state tracking,
- no `beforeunload` / window-close confirmation.

Closing the editor window (or the app quitting for an update — `autoInstallOnAppQuit` is enabled) silently discards all edits since the last manual save. Fix is cheap: debounce-autosave the snapshot (it's already a single serializable object) after each mutation, or at minimum track dirtiness and confirm on close.

### C3. Vulnerable dependency chain: 1 critical, 3 high
`package.json` → `@xenova/transformers@2.17.2` → `onnxruntime-web` → `onnx-proto` → `protobufjs`

`npm audit --omit=dev` reports a critical arbitrary-code-execution advisory (GHSA-xq3m-2v4x-88gg) plus prototype-pollution and DoS advisories in `protobufjs <= 7.6.2`, reachable through the bundled speech-to-text stack. `@xenova/transformers` is abandoned — its successor is `@huggingface/transformers` (v3), which drops the vulnerable `onnxruntime-web` version and adds WebGPU. Migration is mostly a package rename for the `pipeline()` API used in `useSubtitleGeneration.ts`.

---

## High

### H1. No single-instance lock
`src/main/main.ts` — `app.requestSingleInstanceLock()` is never called.

Two app instances can run simultaneously and both write `userData/projects.json` (the ProjectLibrary does unsynchronized read-modify-write across processes) and could both open the same project folder. Add the standard lock and focus the existing window on second launch.

### H2. Global shortcut is registered for the app's entire lifetime
`src/main/main.ts:1068`

`CommandOrControl+Shift+S` is grabbed system-wide at startup and held until quit — even when no recording is running and no recorder window exists. Cmd/Ctrl+Shift+S is "Save As…" in many apps; while Open Video Craft is running (even idle in the background on macOS), that key silently stops working everywhere else. Register the shortcut when recording starts and unregister when it stops.

### H3. Recorder window can become unclosable; recording state can wedge
`src/main/main.ts:186`

While `activeRecordingProjectId` is set, `close` is prevented and delegated to the renderer via `recording:global-stop`. If the renderer hangs or crashes (exactly the situation where a user reaches for the close button), the window can never close and app quit is blocked by the same prevented close. Also, `activeRecordingProjectId` is only cleared by successful `recording:stop`/`recording:fail` IPC — a crashed renderer leaves it set forever. Add an escape hatch: clear the flag and allow close on `webContents` `render-process-gone` / after a stop timeout.

### H4. No CSP and remote font loading in a packaged desktop app
`index.html:7`

- Fonts are fetched from `api.fontshare.com` at runtime: every window load makes a network request from a desktop app (works offline only via HTTP cache luck, leaks usage signal, and is remote content in an Electron renderer). Self-host the font files.
- There is no `Content-Security-Policy` meta tag, so Electron's security warning is suppressed only by the absence of dev warnings in production. Add a strict CSP (`default-src 'self' ovc-media: ovc-import:; style-src 'self' 'unsafe-inline'` etc.).
- Relatedly there is no navigation hardening: no `will-navigate` handler and no `setWindowOpenHandler` on any window. Defense-in-depth for a local-content app, but the Electron checklist items are one small function away.

### H5. Release workflow publishes a live release before assets exist
`.github/workflows/release.yml:109`

`gh release create` publishes immediately, then assets upload one-by-one. During that window, `electron-updater` clients see a published release whose `latest-mac.yml`/installers 404 — the exact race already documented in the project's history. Also, re-running the job deletes the existing release (`gh release delete`) before recreating it, breaking updates for the entire rebuild duration. Fix: `gh release create --draft`, upload everything, then `gh release edit --draft=false`.

### H6. Editor state restore trusts editor.json blindly
`src/renderer/editor/editor-state-storage.ts:101`

`restoreEditorStateSnapshot` casts arrays/objects (`as TimelineSegment[]`, `as ZoomEffect[]`, …) with no shape or number validation. A hand-edited, corrupted, or future-version `editor.json` can inject `NaN`s or wrong shapes that crash the editor at render time with no recovery path. The snapshot is written with `v: 2`, but the restore never reads `v` — a future v3 file will silently half-apply instead of being migrated or rejected. Validate numerics (`Number.isFinite`) and check the version field; on failure, fall back to defaults with a visible warning rather than crashing.

---

## Medium

### M1. Undo/redo covers only timeline segment edits
`src/renderer/editor/useTimelineEditing.ts:214`

The undo stack records segment changes (move/trim/split/delete). Zoom/speed effect edits, subtitle text edits, layout/style/camera changes, and audio-level changes are not undoable. Users will expect Cmd+Z to work editor-wide; at minimum, document the boundary in the UI.

### M2. ProjectLibrary read-modify-write is not serialized in-process
`src/main/project-library.ts:45`

`upsert`/`remove`/`listRecent` each do `readFile → writeFile` with awaits in between and no queue (unlike ProjectStore). Concurrent IPC calls — e.g. `editor:save-project-state` and `ffmpeg:prepare-audio` both call `upsert` — can interleave and drop an entry. Same one-line fix as the store: chain operations through a promise queue.

### M3. Export request numbers are not validated in the main process
`src/main/main.ts:955`, `src/main/ffmpeg.ts:260`

`trimStart`, `trimEnd`, `volume` come from the renderer unchecked. `Math.max(0, NaN)` is `NaN`, and `formatFfmpegNumber(NaN)` produces the literal string `"NaN"` handed to ffmpeg as `-ss NaN`. `clampVolume` handles non-finite input but trim does not. Validate/coerce all numeric IPC fields at the boundary (one small `assertExportVideoRequest` alongside the existing `assertSaveEditorProjectStateRequest`).

### M4. Whisper pipeline: no download progress, rebuilt on every run
`src/renderer/editor/useSubtitleGeneration.ts:64`

First transcription downloads ~150 MB of model weights with the UI stuck on a bare "loading" state — no progress, no size warning, no offline explanation. And `transformers.pipeline(...)` is re-created on every generation, re-initializing the model each time instead of caching the pipeline for the session. Pass a `progress_callback` to surface download progress, memoize the pipeline, and mention the one-time download in the panel.

### M5. Silent device-acquisition failures in the recorder
`src/renderer/recorder/recorder-utils.ts:46`

`getOptionalCameraStream`/`getOptionalMicStream` catch everything and return `null`; the controller then just flips the toggle off (`RecorderController.tsx:373`). Permission denied, device busy, and unplugged all look identical to the user: the checkbox unchecks itself with no message. Surface the error reason at least for the explicit-enable path.

### M6. Chunk-write failure during teardown overwrites the real error
`src/renderer/RecorderController.tsx:566`

`failRecording` stops streams but does not await pending chunk writes. Those writes then reject ("Cannot append media after recording has stopped") and their catch handler calls `failRecording` again, replacing the original, meaningful error message on screen. Guard `failRecording` against re-entry (it already sets `stoppingRef`; also check it on entry) or await/cancel the queues first.

### M7. `windows:minimize-current` stacks `restore` listeners
`src/main/main.ts:628`

Every minimize registers a new `once("restore")` listener. Minimize → restore via taskbar never fires a problem, but minimize repeatedly through paths where `restore` doesn't fire (e.g. `show()` without restore on some platforms) accumulates listeners. Cosmetic today; use a named handler and `removeListener`, or check before adding.

### M8. DevTools shortcuts are enabled in production
`src/main/main.ts:501`

F12 / Ctrl+Shift+I opens detached DevTools in release builds on every window. If intentional (debugging user reports), fine — but consider gating behind `!app.isPackaged` or an env flag; content-protected recorder windows plus DevTools has odd interactions on macOS.

### M9. `project.json` is rewritten on every 5-second chunk for every track
`src/main/project-store.ts:223`

With screen+camera+mic+system enabled, that's 4 atomic JSON writes (temp file + rename each) every 5 seconds for the whole recording, purely to bump `bytesWritten`/`updatedAt`. Consider updating the in-memory record per chunk and flushing `project.json` on a timer (e.g. every 15–30 s) and on stop/fail.

---

## Low / hygiene

- **No LICENSE file.** `package.json` and README both say ISC, but there is no `LICENSE` file in the repo. For a public GitHub project ("Open" is in the name) this makes the license legally ambiguous.
- **No CI on push/PR.** Typecheck and tests run only inside the tag-triggered release workflow. A tiny `ci.yml` running `npm run typecheck && npm test` on every push would catch breakage months before the next release tag.
- **No linter/formatter.** No ESLint or Prettier config anywhere. The code is currently consistent by discipline; tooling would keep it that way as the project grows (or gains contributors).
- **Unused dependency:** `wavesurfer-react` is in `dependencies` but never imported (`wavesurfer.js` is used directly). Remove it.
- **Heavy dependency for one component:** `framer-motion` is imported only by `FloatingDeviceControl.tsx`. A CSS transition would drop ~30 kB gzip from the renderer bundle. Optional.
- **Thin test coverage:** 699 lines of tests vs ~20k lines of source, all pure utility functions. The riskiest logic — recorder state machine, persistence/restore, chunk write queues, IPC handler contracts, ProjectLibrary concurrency — has zero coverage. The hooks are already well-factored, which makes them testable; the store/library classes accept injected clocks and paths, so main-process tests are cheap to add.
- **`stopRecorder` error message** (`recorder-utils.ts:158`) formats `event.type`, which is always the string `"error"` — the message reads "Recorder failed: error". Pull the actual error from `event.error` (MediaRecorderErrorEvent).
- **Untracked file at repo root:** `Open-Video-Craft-Overview.md` is neither committed nor ignored. Decide which.
- **`sharp` pinned to 0.32.x** (dev-only, icon generation) — several major versions behind; upgrade opportunistically.
- **Windows builds are unsigned** — the CI signs/notarizes macOS only. Unsigned NSIS installers trigger SmartScreen "unrecognized app" warnings for every Windows user. Consider at least a self-attested Azure Trusted Signing cert when feasible.
- **Whisper model id hardcoded to `Xenova/whisper-base`** (`subtitle-transcription.ts:8`): fine, but a quality/size dropdown (tiny/base/small) would be a cheap win since the plumbing is model-id agnostic.

---

## Suggested priority order

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 1 | C2 — autosave + unsaved-changes guard | Small | Prevents silent data loss |
| 2 | H5 — draft-then-publish release flow | Small | Eliminates recurring updater 404s |
| 3 | H2 — scope global shortcut to recording | Small | Stops breaking other apps |
| 4 | H1 — single-instance lock | Small | Prevents library/project corruption |
| 5 | C3 — migrate to `@huggingface/transformers` | Small–Med | Clears critical advisory |
| 6 | M3 + H6 — validate IPC numbers & editor.json restore | Small | Robustness |
| 7 | C1 — close the export gap (start with .srt export + honest export dialog, then composited export) | Large | The product's core promise |
| 8 | H4 — self-host fonts + CSP | Small | Offline correctness, hardening |
| 9 | Low items (LICENSE, ci.yml, ESLint, unused deps) | Small | Hygiene |

---

*Generated by a full-source audit; every finding was verified against the code at the cited file:line locations. Typecheck and the existing test suite pass on the audited revision.*
