# AUDIT.md — Open Video Craft security & code-flaw audit

**Version audited:** 2.0.0 (`main` @ `48d3d83`) · **Date:** 2026-07-14 (rev 2)
**Scope:** `src/main`, `src/preload`, `src/mcp`, `src/renderer`, `src/shared`, plus CSP, entitlements, and electron-builder config.
**Method:** manual read of every main-process module, the preload bridge, the MCP server, and the security-relevant renderer paths. Findings below were verified against the current code, not carried over blindly.

## Remediation status — 2026-07-14

The actionable findings were implemented in the working tree after this audit:

- **Resolved:** 1.1 (bundled local backgrounds/CSP), 1.3 (compatible Electron fuses), 1.5 (validated Trash-only project deletion), 1.6 (UUID validation), 1.8 (protocol invariant), 2.1 (import-time rejection), 2.2 (accurate export disclosure), 2.3 (progress/cancel/timeout), 2.4 (sleep auto-pause + media-derived duration), 2.5 (Whisper Web Worker with WebGPU/WASM fallback), 2.6 (hardware H.264 probe/fallback + copy-remux fast path), 2.7 (display-id overlay resilience), 2.8 (mtime cache/capped recents), and 2.9 (single-use preload drag/drop grants).
- **Partially resolved and package-tested:** 1.2. `allow-unsigned-executable-memory` was removed. `allow-jit` remains required by Electron and `disable-library-validation` remains for the unpacked ONNX native runtime. An ad-hoc hardened-runtime package passed strict code-signature verification with the reduced entitlements.
- **Credential-dependent:** 1.4. The release workflow now accepts `WINDOWS_CSC_LINK` / `WINDOWS_CSC_KEY_PASSWORD` and verifies Authenticode signatures when configured. A real signature still requires the repository owner to provide a Windows signing certificate or Azure Trusted Signing credentials.
- **Accepted low-risk dependency:** 1.7. Provider commands and arguments remain fixed (no renderer-controlled shell input), with a 15-second timeout. The login shell remains as the compatibility fallback for CLI tools installed by user shell managers.
- **Already resolved before this remediation:** 2.10. `formatDuration` already emits `H:MM:SS` for hour-plus recordings; the original finding was stale.

Validation completed: TypeScript, 27 test files / 111 tests, MCP smoke test, production renderer/main build, ad-hoc macOS packaging, Electron fuse inspection, and strict package signature verification.
**Rev 2 corrections** (after independent cross-review): the Export dialog *does* disclose preview-only features — the finding is now about its stale copy (2.2); `formatDuration` handles hours (old 2.10 removed); the autosave failure mode in 2.1 is re-triggered-per-edit, not an infinite loop. The three P1 engineering gaps (2.1, 2.3, 2.4) were re-verified and stand.

Severity: **P0** = fix before next release · **P1** = fix soon · **P2** = hardening · **P3** = latent/defense-in-depth.

## Overall posture

The security fundamentals are strong and have improved since the prior (`REUBEN.md`, v1.3.1) audit. Verified good:

- `contextIsolation: true`, `nodeIntegration: false`, renderer sandbox never disabled, typed `contextBridge` bridge as the only IPC surface (`preload.ts`).
- Navigation hardening: `setWindowOpenHandler` deny + same-origin `will-navigate` guard on every web-contents (`main.ts:1282`).
- Permission request handler restricted to app windows and only `media`/`display-capture` (`desktop-permissions.ts:41`); display-media handler only ever exposes the user-selected source.
- Path-traversal guard on `resolveProjectFile` (`project-store.ts:348`), the MCP contact-sheet reader (`editor-analysis.ts:84`), and imported-analysis source resolution (`editor-analysis.ts:238`).
- `app:open-external` restricted to http/https (`app-status-ipc.ts:24`).
- ffmpeg invoked via `spawn` with an argv array (no shell → no arg injection), killed on quit, stderr capped (`ffmpeg.ts:743`).
- Recording chunk size capped at 256 MB (`main.ts:122`, `main.ts:1125`); `projects:create` only accepts a `baseDirectory` previously granted through the folder picker (`main.ts:1078`).
- Atomic JSON writes with transient-lock retry (`project-file.ts:39`), SRT cue sanitization (`subtitle-export.ts:45`), IPC payload validators (`request-validation.ts`).

**Fixed since the prior audit (confirmed):** preview/timeline media now set `crossOrigin="anonymous"` (no CORS-tainted silence); macOS app menu restored with edit roles (copy/paste works); export now renders cuts/sequence/zoom/speed/transitions/text/audio-mix/subtitle burn-in through a real ffmpeg composition; the Export dialog gained a "What this export includes" disclosure panel (`ExportDialog.tsx:87`); recording adds `ended` listeners on camera/mic/system tracks; persistence snapshot + signature are memoized; SRT is sanitized; `formatDuration` handles hour-plus recordings (`recorder-utils.ts:231`); connect-src CSP now lists the custom schemes and huggingface.

The items below are what remains.

---

## 1. Security

### 1.1 (P2) CSP still allows remote images from `https://images.unsplash.com`
`index.html:6` — `img-src` includes `https://images.unsplash.com`, used only for the six "real-world" editor backgrounds. In a desktop app this is a privacy beacon (Unsplash sees IP/usage), a hard offline failure (background renders black with no network), and an unnecessary remote-content origin. Bundle the six images locally and drop the origin. (`connect-src` was correctly tightened to the custom schemes + `huggingface.co` for the STT model download — leave those.)

### 1.2 (P2) macOS entitlements are broader than needed
`build/entitlements.mac.plist` grants `allow-jit`, `allow-unsigned-executable-memory`, and `disable-library-validation`. Nuance vs. the prior audit: `onnxruntime-node` is now bundled and asar-unpacked (`package.json` build.asarUnpack), so `disable-library-validation` may now be load-bearing for that unsigned native module — test before removing it. `allow-unsigned-executable-memory` is very likely still droppable on modern Electron. Trim in a notarized test build; every dropped entitlement shrinks the code-injection surface.

### 1.3 (P2) No Electron fuses — but the MCP design constrains which ones
No `@electron/fuses`/`afterPack` config exists (`package.json` build has no `afterPack`). Standard hardening flips `EnableNodeCliInspectArguments=off`, `EnableNodeOptionsEnvironmentVariable=off`, `OnlyLoadAppFromAsar=on`. **Caveat specific to this app:** the AI integration registers the MCP server by invoking the packaged Electron binary with `ELECTRON_RUN_AS_NODE=1` (`ai-connection.ts:84,89`), so you **cannot** flip the `RunAsNode` fuse off without breaking your own MCP feature. Flip the other three, which don't conflict.

### 1.4 (P2) Windows binaries are unsigned
`package.json` build.win has only `icon`/`target` (nsis + portable, x64) — no `certificateFile`/`CSC_LINK`. Users get SmartScreen warnings and electron-updater's on-disk verification is weaker without a publisher certificate (transport is HTTPS-to-GitHub via `publish.provider: github`, which is decent). Budget permitting, use Azure Trusted Signing or an OV cert and enable `verifyUpdateCodeSignature`.

### 1.5 (P2) `projects:delete` can permanently `fs.rm` a path read from the library file
`main.ts:1047-1051` — after a confirm dialog (which does show the path, good), if `shell.trashItem` fails it falls back to `fs.rm(entry.rootPath, { recursive: true, force: true })`. `entry.rootPath` comes from the user-writable `projects.json`. If that file is ever tampered with, the fallback is a recursive delete of an arbitrary path. Before deleting, validate the folder actually contains a `project.json` whose `id` matches `projectId`; consider dropping the permanent-delete fallback entirely (tell the user trash failed instead).

### 1.6 (P3) `editor:undo-agent-edit` IPC accepts an unvalidated `editId` that reaches a file path
`main.ts:749-756` validates `editId` only as `typeof === "string"`, then passes it to `undoAgentEdit`, which builds a checkpoint path `${editId}.json` (`editor-document-store.ts:188`). Traversal is currently blocked in practice by the earlier equality guard `current.lastMutation.editId !== input.editId` (the on-disk editId is a real UUID), so a crafted `../` value can't match and is rejected before the path is used. Still, the raw renderer string reaching `path.join` is a latent gap — validate it as a UUID here the way the MCP layer already does (`server.ts:220`, `z.string().uuid()`).

### 1.7 (P3) AI-provider probing runs a login shell and inherits the full environment
`ai-connection.ts:112` — `run()` spawns with `env: { ...process.env, ...extraEnv }`; `resolveProviderExecutable` (`:135`) runs `$SHELL -lic "command -v <provider>"`. The command and args are fixed literals (`"codex"`/`"claude"`), so there is **no injection vector**, but executing the user's login rc is an environment dependency that can hang or misbehave (the 15 s timeout mitigates hangs). Low risk; noted for completeness. Not exploitable from the renderer.

### 1.8 (P3) `ovc-import://` serves any registered absolute path with `ACAO: *` — keep the invariant
By design (`media-protocols.ts:46`), registration only happens through the file dialog / drag-drop / validated project-internal imports, and lookups are by opaque UUID. This is safe today. Document the invariant in the file header so a future "register a path over IPC" convenience can't quietly turn it into an arbitrary-file-read oracle.

---

## 2. Correctness / code flaws

### 2.1 (P1) Importing an extensionless (or non-alphanumeric-extension) file permanently breaks saving
Still present. `describeImportedFile` (`file-dialogs.ts:120`) derives `extension` from the filename; the import dialog allows "All Files" (`file-dialogs.ts:71`), and extensionless files are common on macOS → `extension` becomes `""`. On save, `isEditorProjectImportInput` requires `extension` to match `/^[a-zA-Z0-9]{1,12}$/` (`project-file.ts:159`), so `persistEditorImport` throws "invalid metadata" (`project-store.ts:441`) and the save rejects. The autosave effect re-arms on every subsequent edit (`useEditorPersistence.ts:496-512`), so the error banner returns on each change, and **both autosave and manual save stay broken** until the offending import is removed — with nothing telling the user which import is the problem. Unicode/full-width extensions hit the same wall. **Fix:** reject unsupported files at import time with a clear message, or fall back to a sniffed/`bin` extension instead of throwing at save time.

### 2.2 (P2) Export dialog's disclosure copy is stale — it under-claims what exports now include
The composition export (`ffmpeg.ts:exportTimelineComposition`, reached via `editor-export.ts:47`) renders cuts, sequencing, transitions, **zoom, speed, text overlays**, audio mixing, and subtitle burn-in. The Export dialog *does* have a "What this export includes" panel (`ExportDialog.tsx:87-91`) — an earlier draft of this audit missed it — but its copy is now wrong in both directions:
- The amber warning says "zoom/speed effects … remain preview-only", yet both are exported by the composition path (`composition-export.ts:76-102`).
- The includes line omits zoom, speed, and text overlays entirely.
- What genuinely remains preview-only: layout modes, camera-bubble compositing, backgrounds, corner styles, screen position/scale, and styled subtitles (the MCP layer declares this correctly at `server.ts:294`).

Also note the copy is one static string, but the fallback path (`editor-export.ts:63` — used when the source is an import or the project has no video timeline segments) exports none of the timeline features it lists. Update the copy to match the composition path, and ideally make it path-aware.

### 2.3 (P1) ffmpeg export has no timeout, progress, or cancel
`ffmpeg.ts:743` `runProcess` resolves/rejects on child close only — no `-progress` parsing, no timeout, no cancel handle. Kill-on-quit (`killActiveFfmpegProcesses`) and the capped stderr are done, but a corrupt/huge input spins the Export dialog forever with no way to cancel (the dialog blocks close while `exporting`). **Do:** pass `-progress pipe:1`, parse `out_time_ms` against known duration for a real progress bar, keep the child handle to back a Cancel button, and add a sane wall-clock ceiling.

### 2.4 (P1) Recording duration is wall-clock; no `powerMonitor` handling
`getCurrentRecordedDurationMs` (`RecorderController.tsx:723`) is `activeRecordedMs + (Date.now() - segmentStartedAt)`. `powerMonitor` is used nowhere in `src/` (verified). If the machine sleeps mid-recording, the elapsed timer and persisted `durationMs` include the sleep gap while MediaRecorder produced nothing, and the editor trusts `durationMs` for timeline math until real metadata loads. Derive final duration from the remuxed media (ffprobe / `<video>` metadata) and listen for suspend/resume to auto-pause or at least flag the recording.

### 2.5 (P2) Whisper transcription still runs on the renderer main thread
`useSubtitleGeneration.ts:117-130` dynamically imports `@huggingface/transformers` and calls `transformers.pipeline(...)` directly in the renderer — no Web Worker. Without cross-origin isolation, onnxruntime-web is single-threaded WASM, so transcribing long audio pegs and jank-freezes the whole editor for minutes. Move the pipeline into a Web Worker (CSP already allows `worker-src 'self' blob:`) and prefer `device: "webgpu"` with a WASM fallback. The first run also downloads ~145 MB from huggingface.co — the progress UI exists but surface an explicit "requires network" hint for offline users.

### 2.6 (P2) Software-only export encoders
`createCodecArgs` (`ffmpeg.ts:675`) always uses `libx264 -preset medium` / `libvpx-vp9`. The bundled ffmpeg-static supports `h264_videotoolbox` (macOS) and, on Windows, `h264_nvenc`/`qsv`/`amf` — probe and use them for 5–15× faster mp4/mov exports, falling back to libx264. Also: a `-c:v copy` remux path when `resolution === "source"`, format mp4/mov, `trimStart === 0`, and no filters would make those exports near-instant.

### 2.7 (P2) Overlay border can vanish after a source-list refresh
`sources:list` clears `sourceCache` on every call (`main.ts:766`). A `display-metrics-changed`/re-list that reassigns source ids leaves `showDisplayOverlay` unable to find the previously-selected id (`main.ts:477`) and it closes the border even though the display is still connected. Cache per-listing generation, or re-resolve the overlay by `display_id` rather than capture-source id.

### 2.8 (P2) `projects:list-recent` re-reads every `project.json` on every launcher view
`ProjectLibrary.listRecentUnlocked` (`project-library.ts:32`) stat+reads every project folder on each call, and `get()` funnels through it too (so deleting one project re-scans all). Cheap for 10 projects, slow at 200 or on synced/network folders. Cache by mtime and cap the recent list.

### 2.9 (P2) `editor:import-media-paths` accepts renderer-supplied absolute paths
`main.ts:903` registers any renderer-supplied file path into `importedMediaCache` after only a `stat().isFile()` check (`file-dialogs.ts:100`). Combined with `ovc-import://` serving any registered path with `ACAO: *`, a compromised renderer could register and then read any file the user can read. This is the intended OS drag-drop path (`webUtils.getPathForFile`), and the renderer is sandboxed/local-only, so it's defense-in-depth — but consider gating registration to paths that actually arrived via a real drag/drop event rather than trusting an arbitrary IPC string array.

---

## 3. Prioritized action list

Keep the modular shape the codebase already has — separate services, hooks, IPC contracts, and small UI components rather than growing the large editor files.

**P1 — next**
1. Fix import validation and recovery: import-time rejection (or sniffed/`bin` fallback) for extensionless/odd-extension files, plus a save error that names the offending import (2.1).
2. Build an export-job module: ffmpeg progress (`-progress pipe:1`), cancellation, and a wall-clock timeout, surfaced in the Export dialog (2.3).
3. Correct recording duration from media metadata (ffprobe / `<video>` metadata) and handle `powerMonitor` suspend/resume (2.4).

**P2 — hardening & accuracy**
4. Fix the Export dialog disclosure copy (zoom/speed/text are exported; layout/camera/backgrounds are not) and make it path-aware (2.2).
5. Validate the delete target folder before the `fs.rm` fallback (1.5); UUID-validate `editId` in `editor:undo-agent-edit` (1.6).
6. Bundle the Unsplash backgrounds; drop the remote `img-src` origin (1.1); add the three non-conflicting Electron fuses (1.3).
7. Trim macOS entitlements (test `disable-library-validation` need for onnxruntime-node) (1.2); Windows code signing (1.4).
8. Whisper → Web Worker + WebGPU (2.5); hardware export encoders + copy-remux fast path (2.6).

**P3 — remaining**
9. Overlay-border source-id resilience (2.7); recent-projects cache/cap (2.8).
10. Gate `import-media-paths` to real drag/drop (2.9); document the `ovc-import://` invariant (1.8).
