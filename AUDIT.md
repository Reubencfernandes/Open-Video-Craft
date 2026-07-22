# Open Video Craft v1.0.2 audit

**Audit date:** 2026-07-22
**Release line:** 1.0.2
**Scope:** recorder lifecycle, project persistence/deletion, renderer IPC,
Gemini and local AI jobs, export behavior, timeline/subtitle accessibility,
dependencies, packaging, CI, documentation, and release metadata.

This document records confirmed behavior in the v1.0.2 release candidate. It
does not claim that every finding is fixed. Severity is based on user impact:
**P0** blocks release, **P1** should be fixed soon, and **P2** is hardening or
accessibility debt.

## Release posture

The published stable release is v1.0.1, so v1.0.2 is the next stable patch.
Earlier v2.x tags were beta-test builds used only by the owner and are not part
of the public stable update line. The release should not be tagged until the
packaging, signing, dependency, and upgrade checks at the end of this document
pass.

The following safeguards are present and verified in source:

- Renderer windows use context isolation, no Node integration, a typed preload
  bridge, navigation blocking, a restrictive CSP, and validated IPC inputs on
  security-sensitive paths.
- Project JSON writes are atomic and retry transient filesystem locks.
- FFmpeg jobs have bounded logs, progress, cancellation, and quit cleanup.
- macOS release verification checks updater metadata, hashes, the Developer ID
  team, strict signing, Gatekeeper acceptance, and a stapled notarization ticket.
- CI runs typechecking, unit tests, production builds, and the bundled MCP
  smoke test on both supported operating systems.

## Fixed for v1.0.2

These regressions were found during this audit and have targeted coverage in the
v1.0.2 worktree:

1. **SRT collision data loss.** Sidecars are created exclusively instead of
   overwriting an existing `.srt`; project-timeline exports reserve that path
   before rendering, and a late collision in the raw/import fallback no longer
   deletes the video output. Burn-in subtitles use a scoped temporary directory
   (`src/main/composition-export.ts`, `src/main/editor-export.ts`,
   `src/main/subtitle-export.ts`).
2. **Native editor undo.** Cmd/Ctrl+Z and redo shortcuts remain native while
   focus is in an input, textarea, select, or contenteditable element
   (`src/renderer/editor/useEditorShortcuts.ts`).
3. **Subtitle boundary overlap.** Cue activity uses a half-open interval, so an
   ending cue and the next starting cue are not both active at the exact handoff
   time (`src/renderer/editor/subtitle-time.ts`).
4. **Multi-selection Cut.** The single-item clipboard now removes only the
   primary media clip it actually copied, without deleting the rest of a
   multi-selection or unrelated timed items
   (`src/renderer/editor/useTimelineClipboard.ts`).
5. **Release metadata drift.** Package, documentation, in-app notes, and the MCP
   handshake now use the v1.0.2 line; the MCP smoke test asserts the packaged
   server version.
6. **Release checks.** CI now builds production bundles and exercises the MCP
   server in addition to typechecking and unit tests (`.github/workflows/ci.yml`).
7. **FFmpeg source path.** Every packaged app includes an explicit source offer,
   and the tag workflow publishes the exact FFmpeg 8.1.2 source archives,
   pinned macOS/Windows build scripts, dependency sources, checksums, and release
   metadata beside the installers (`FFMPEG_SOURCE_OFFER.md`,
   `THIRD_PARTY_NOTICES.md`, `.github/workflows/release.yml`).
8. **Inactive dashboard control.** The project filter/settings glyph beside the
   home search was decorative and has been removed (`src/renderer/home/HomeHeader.tsx`).

## Confirmed open findings

### P1 — Reliability, data loss, and security

#### 1. Interrupted recordings are not reconciled at app startup

`ProjectStore.startRecording` persists a project with status `recording`, and
the main process handles a recorder renderer crash while that process remains
alive. Startup does not scan the project library for a recording left behind by
a full app crash, forced restart, or power loss. That project can remain stuck
as `recording` even though its chunk files may be recoverable.

**Evidence:** `src/main/project-store.ts` (`startRecording`),
`src/main/main.ts` (renderer crash handling and startup).
**Fix:** reconcile interrupted projects during startup, probe usable media,
finalize recoverable tracks, and otherwise mark the project failed with a clear
recovery action.

#### 2. Gemini uploads load the entire recording into main-process memory

`GeminiAgentManager.ensureVideoUploaded` calls `fs.readFile` for the complete
video before upload. A multi-gigabyte recording can cause a severe memory spike
or terminate the Electron main process.

**Evidence:** `src/main/gemini-agent.ts` (`ensureVideoUploaded`).
**Fix:** stream or resumably upload from disk, cap accepted size, report upload
progress, and reject oversized input before allocating it.

#### 3. Cached AI analysis can outlive the edit it describes

Gemini returns the latest cached analysis before validating its fingerprint at
all, so even a changed source file can reuse stale output. The fingerprint also
omits the current editor revision and timeline, allowing cached transcripts and
contact sheets to outlive cuts, reordering, and speed changes.

**Evidence:** `src/main/gemini-agent.ts` (`runAnalysis`) and
`src/main/editor-analysis.ts` (`createFingerprint`).
**Fix:** include the relevant editor revision/timeline signature in the cache
key, or invalidate composition-sensitive analysis after every timeline change.

#### 4. Local cancellation does not stop all long-running work

The Gemini cancel path aborts the request controller, but locally executed tool
work does not receive that signal. Analysis polling can continue for up to ten
minutes after the user presses Cancel.

**Evidence:** `src/main/gemini-agent.ts` (`cancel`, `executeTool`, and
`runAnalysis`).
**Fix:** thread an `AbortSignal` through tool execution, analysis jobs, polling,
and subprocesses; clean up partial work when cancellation wins.

#### 5. ACE-Step can accept an incomplete model cache as ready

The legacy local music setup treats a cache above roughly 2 GB as complete,
while a normal checkpoint download is substantially larger. An interrupted
download can therefore become a permanently broken “ready” cache.

**Evidence:** `src/main/music-generation.ts` and
`resources/acestep_generate.py`.
**Fix:** validate a manifest of required files, sizes, and preferably hashes;
resume or replace partial downloads atomically.

#### 6. Provider keys can be revealed to the renderer

The provider-key service states that plaintext keys remain in the main process,
but the preload bridge exposes a reveal operation and the IPC handler returns
the plaintext value. When Electron `safeStorage` is unavailable, persistence
also silently falls back to reversible base64/plaintext storage. A renderer or
local-file compromise can therefore expose saved AI keys.

**Evidence:** `src/main/provider-keys.ts`, `src/preload/preload.ts`, and the
provider IPC handlers in `src/main/main.ts`.
**Fix:** remove key reveal from the renderer API. Use masked state plus
main-process provider calls, and require replacement rather than readback.

#### 7. `projects:discard` permanently removes a loaded project

The discard handler reaches recursive filesystem removal rather than Trash and
does not revalidate the target as carefully as the normal project-delete path.
A mistaken call is not recoverable from the OS Trash.

**Evidence:** `src/main/main.ts` (`projects:discard`) and
`src/main/project-store.ts` (`discardProject`).
**Fix:** use the validated Trash-only deletion service, require an eligible
temporary/recording status, and reject broad or mismatched project roots.

#### 8. Failed final save is ignored when leaving the editor

`saveState` catches persistence failures internally, and `leaveToHome` also
continues after an error. It disables the unload guard and navigates home even
when the final dirty snapshot was not written.

**Evidence:** `src/renderer/editor/useEditorPersistence.ts` (`saveState`) and
`src/renderer/EditorView.tsx` (`leaveToHome`).
**Fix:** return an explicit save result, keep the editor open on failure, and
offer Retry / Leave without saving as an intentional choice.

#### 9. Export can silently bypass the edited timeline for an imported source

When an imported video is selected, the renderer sends an `import` export
source before considering the saved project. The main process then uses the
single-source FFmpeg path, bypassing timeline cuts, ordering, effects, and text.

**Evidence:** `src/renderer/editor/useEditorExport.ts` (`getExportSource`) and
`src/main/editor-export.ts` (`exportEditorVideoToPath`).
**Fix:** make “Export project timeline” the default whenever a project timeline
exists, and expose direct source export as a separate, clearly labelled action.

#### 10. Preview composition exceeds current export composition

Preview renders camera compositing, layout modes, backgrounds, screen position,
and corner styling. The composition exporter does not receive or render those
fields. The README documents this limitation, but the export modal does not
warn users at the point of action.

**Evidence:** `src/renderer/editor/PreviewContent.tsx`,
`src/main/composition-export.ts`, `src/mcp/server.ts` export capabilities, and
`src/renderer/editor/ExportDialog.tsx`.
**Fix:** either render those fields in FFmpeg or show a concise, path-aware
preview-versus-export disclosure in the modal.

#### 11. AI and MCP `import_media` silently drops valid paths

AI operations queue absolute media paths, but the preload bridge only accepts
paths backed by single-use drag-and-drop grants. Agent-provided paths never
receive such a grant, so the request is filtered to an empty list and no-ops.

**Evidence:** `src/main/operations.ts`, `src/preload/preload.ts`, and
`src/renderer/EditorView.tsx` (`importMediaFromPaths`).
**Fix:** add a dedicated main-process import operation with canonical path and
file-type validation, or issue scoped import grants when an approved AI plan is
applied; surface rejection instead of silently returning an empty list.

#### 12. Fresh AI analysis describes raw sources, not the edited timeline

Local analysis selects one raw screen/video source and one raw mic/system audio
source. It does not render the mixed, cut, reordered, or speed-adjusted
composition, so timestamps and contact sheets can disagree with what the user
is editing even when the cache is fresh.

**Evidence:** `src/main/editor-analysis.ts` (`runEditorAnalysis`) and timeline
composition in `src/main/composition-export.ts`.
**Fix:** analyze a bounded proxy rendered from the current editor timeline and
include the editor revision in its fingerprint.

#### 13. Local Whisper cannot cancel and fully buffers long projects

On-device transcription reads every source and constructs the complete 16 kHz
timeline mix inside the renderer before inference. The cancel button is only
available for cloud providers, and unmounting does not abort local decode or
inference. Long recordings can exhaust renderer memory and keep working after
the user leaves the panel.

**Evidence:** `src/renderer/editor/useSubtitleGeneration.ts`,
`subtitle-transcription-client.ts`, and `media-utils.ts`.
**Fix:** stream/chunk decode and inference in a worker, expose cancellation for
all providers, and abort/clean up on project switch or unmount.

#### 14. “Source” resolution exports at 1920×1080

The timeline composition path falls through to a fixed 1920×1080 canvas when
resolution is set to `source`, rather than probing and preserving the source
dimensions.

**Evidence:** `src/main/ffmpeg.ts` resolution selection and composition output
setup.
**Fix:** probe the selected/project primary source and carry its dimensions
through the composition plan, with a documented fallback only when probing
fails.

#### 15. Recorder failure can race and lose final buffered chunks

Normal stop awaits the recorder `stop` event and all write queues. The failure
path stops streams, clears recorder references, and marks the project failed
without waiting for the final `dataavailable` event or queued writes, so the
last recoverable chunks can be lost.

**Evidence:** `src/renderer/recorder/RecorderController.tsx` normal stop and
`failRecording` paths.
**Fix:** share one idempotent finalization routine that waits for recorder stop,
final chunks, and write queues before setting the terminal project status.

#### 16. Removed imported media remains in project storage

Removing an import drops it from the renderer and in-memory cache, but saved
files in the project `imports/` directory are not unlinked. Large or private
media can accumulate indefinitely after it disappears from the project UI.

**Evidence:** `src/renderer/editor/useEditorMediaActions.ts`, the
`editor:remove-imported-media` handler in `src/main/main.ts`, and project import
persistence in `src/main/project-store.ts`.
**Fix:** garbage-collect unreferenced imports after a successful revision-checked
save, using project-root containment checks and recoverable deletion where
possible.

### P1 — Accessibility

#### 17. Subtitle timing controls are pointer-only

Start and end values are correctly read-only in subtitle cards, but the only
trim handles are pointer-driven spans on timeline clips. Keyboard-only users
cannot change subtitle timing.

**Evidence:** `src/renderer/editor/panels/SubtitlesPanel.tsx` and
`src/renderer/editor/TimelineClips.tsx`.
**Fix:** make trim handles focusable sliders/separators with arrow-key steps,
accessible names, and the same clamping used by pointer dragging.

#### 18. Global styles remove focus visibility without complete replacements

The global stylesheet suppresses outlines for buttons and ARIA controls. Many
controls provide no equivalent `:focus-visible` treatment, making keyboard
focus difficult or impossible to locate.

**Evidence:** `src/renderer/styles.css`, with examples in
`src/renderer/editor/TimelineClips.tsx` and `EditorTopbar.tsx`.
**Fix:** restore a shared high-contrast `:focus-visible` ring, overriding it
only where an equally visible component-specific style exists.

#### 19. Modal dialogs do not manage focus

Export, changelog, and AI-connection dialogs declare `aria-modal`, but do not
consistently move initial focus inside, trap Tab, close on Escape, or restore
focus to the invoking control.

**Evidence:** `src/renderer/editor/ExportDialog.tsx`,
`src/renderer/home/ChangelogDialog.tsx`, and AI connection dialog components.
**Fix:** implement a tested dialog focus lifecycle and preserve the exporting
state rule that prevents accidental closure while a job is active.

### P2 — Recorder and packaging hardening

#### 20. System-audio fallback retries on cancellation and can fail silently

The recorder retries display capture without audio for every first-call error,
including explicit denial or cancellation. This can open a second prompt. If
capture succeeds without an audio track, the system-audio toggle is silently
turned off.

**Evidence:** `src/renderer/RecorderController.tsx` display-capture fallback.
**Fix:** retry only known unsupported-audio errors, preserve cancellation, and
show a clear warning when requested system audio is unavailable.

#### 21. Packaged ONNX assets are larger than necessary

The broad `onnxruntime-node` unpack rule can include binaries for other
platforms and architectures, while the renderer bundle emits both a root and a
hashed copy of the same large WASM runtime. This increases download and install
size without adding functionality.

**Evidence:** `package.json` `asarUnpack`, `vite.config.ts`, and packaged
`app.asar.unpacked` contents.
**Fix:** prune native files by target platform/architecture and emit one runtime
WASM path, then verify Whisper and MCP analysis in each packaged artifact.

## Dependency, licensing, and signing notes

- Dependency review covered earlier build-tool advisories plus current Sharp,
  Hono, and `fast-uri` advisories. The v1.0.2 lockfile uses Sharp 0.35.3,
  `@hono/node-server` 2.0.11, and `fast-uri` 3.1.4; both the full and
  production-only audits report zero vulnerabilities. A clean `npm ci` remains
  a release gate.
- The app is ISC-licensed but distributes FFmpeg. FFmpeg license text,
  corresponding-source/source-offer information, build provenance, and codec
  configuration must ship with the installers. A binary built with
  `--enable-nonfree` is not releasable.
- A single dependency install must not be reused blindly for both Intel and Arm
  macOS packages. The v1.0.2 packaging hook prepares and verifies the pinned
  FFmpeg binary for each target architecture; both resulting apps still require
  an architecture and codec/license verification gate.
- macOS publishing requires the Developer ID and notarization credentials
  documented in `README.md`. The release verification script must pass for both
  updater ZIPs.
- Windows v1.0.2 uses the pinned BtbN FFmpeg 8.1.2 static GPL build, verifies
  both the archive and extracted executable hashes, and publishes its exact
  build scripts plus dependency source cache. Authenticode credentials are not
  configured, so the Windows artifacts are explicitly labeled unsigned.
- The current macOS artifacts are Developer ID direct-download builds, not Mac
  App Store packages. An App Store submission needs a separate sandboxed `mas`
  target, Store-managed updates, App Store entitlements, and a fresh legal
  review of GPLv3 binary distribution under Store terms. Do not submit the
  current DMG/ZIP configuration as if it were App Store-ready.

## Validation record

Working-tree validation after the v1.0.2 changes:

- A clean `npm ci --no-audit --no-fund` passed on macOS and installed the
  pinned FFmpeg input through the package lifecycle hook.
- `npm run typecheck` passed.
- `npm test -- --reporter=dot` passed 63 files / 289 tests. Several React tests
  emitted non-failing `act(...)` environment warnings.
- `npm run build` passed. Vite retained its known large-chunk warning and emitted
  two copies of the approximately 21.6 MB ONNX WASM runtime described above.
- `npm run test:mcp` passed, including the package-derived server-version check.
- The full and production-only `npm audit` runs both reported zero
  vulnerabilities across the current lockfile.
- `npm run verify:ffmpeg` passed, and an ad-hoc arm64 app-directory package
  contained an arm64 FFmpeg binary plus the third-party notices, source offer,
  and macOS rebuild notes; strict code-signature verification passed.
- All 32 macOS FFmpeg source archives matched the committed SHA-256 manifest;
  the source-bundle and basename-only release-checksum staging simulations
  passed.
- The previous v1.0.1 GitHub workflow verified two signed and notarized macOS
  updater archives; its Windows job explicitly reported unsigned artifacts.

The pushed commit still requires GitHub CI on both operating systems and the
tag workflow's signed/notarized Intel and Apple Silicon archive verification.
The source workflow installs Rust before vending rav1e's locked crates because
Cargo was not available for that single step in the local environment.

## Release checklist

1. Run `npm ci` on clean macOS and Windows CI workers.
2. Run typechecking, the full unit suite, production build, and MCP smoke test.
3. Confirm the full and production dependency audits have no unaccepted
   advisories.
4. Build Intel and Arm macOS plus Windows x64 artifacts from the exact tagged
   commit using their platform-specific pinned FFmpeg inputs.
5. Verify each packaged FFmpeg executable has the correct architecture, expected
   hash/provenance, and no `--enable-nonfree` configuration.
6. Verify macOS signatures, team identity, notarization, stapling, updater YAML,
   archive hashes, and Gatekeeper acceptance.
7. Verify the Windows Setup and Portable artifacts, updater metadata, bundled
   FFmpeg architecture/capabilities, and clearly disclosed unsigned status.
8. Verify the release contains the FFmpeg source-offer bundle and that the
   in-package source link resolves to that asset.
9. Smoke-test recording, project reopen, subtitle timeline edits, export/cancel,
   on-device Whisper, and MCP startup in packaged builds.
10. Test the desktop update from the published v1.0.1 build to v1.0.2. Any
   internal build with a version greater than 1.0.2, including 1.0.9–1.5.0 or
   beta 2.x, must be replaced manually because the updater will not downgrade.
11. Confirm README screenshots and release notes match the tagged build, then
    push the matching `v1.0.2` tag and inspect every uploaded installer,
    blockmap, and updater metadata file before announcement.
