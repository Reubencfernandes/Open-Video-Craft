# Source Architecture

This folder is split by runtime first, then by feature. Keep new code close to
the system it belongs to instead of growing one large file.

A complete per-file reference lives in [`docs/FILES.md`](../docs/FILES.md).

## Runtime Folders

- `main/` contains Electron main-process code: windows, IPC handlers, OS
  permissions, media protocols, update checks, project storage, and FFmpeg work.
- `preload/` exposes the safe `window.openVideoCraft` bridge used by React.
- `renderer/` contains the React UI and browser-side editor logic.
- `shared/` contains types shared by main, preload, and renderer.

## Main Process

- `main.ts` is the app bootstrap and orchestrator. It should create windows,
  register top-level handlers, and call focused modules.
- `app-shell.ts` owns the app id, app name, dock/about panel, and icon path.
- `app-status-ipc.ts` exposes app version and update status IPC.
- `auto-updates.ts` owns electron-updater state, checks, downloads, restart
  prompts, and update-status broadcasts.
- `desktop-permissions.ts` owns OS permission status, macOS settings links, and
  trusted capture permission requests.
- `desktop-sources.ts` owns desktopCapturer source listing and fallback source
  thumbnails.
- `media-protocols.ts` owns `ovc-media://` and `ovc-import://`, including
  Range-header forwarding for seekable media playback.
- `file-dialogs.ts` owns native open/save dialogs and imported-media file
  classification.
- `project-store.ts` owns project files on disk.
- `project-library.ts` owns the recent-project index.
- `ffmpeg.ts` owns remuxing, audio conversion, and export execution.

When adding a new main-process feature, prefer a small module plus one IPC
registration call instead of adding more logic directly to `main.ts`.

## Renderer

- `App.tsx` is the launcher screen.
- `RecorderController.tsx` owns recording state and delegates rendering to
  `recorder/RecorderControllerView.tsx`.
- `EditorView.tsx` is the editor's composition root: it owns shared editor
  state, wires the hooks under `renderer/editor/` together, and renders the
  layout. Editing logic lives in the hooks, not here.
- `AppVersionStatus.tsx` renders the bottom-left version/update pill.
- `useAppUpdateStatus.ts` loads app/update status and listens for update events.

## Editor Modules

- `editor/panels/` contains one left-panel component per tool.
- `editor/EditorPreviewPanel.tsx` renders the preview shell.
- `editor/PreviewContent.tsx` renders screen, camera, subtitles, and overlays.
- `editor/EditorTimelineSection.tsx`, `editor/Timeline.tsx`, and
  `editor/TimelineClips.tsx` render timeline controls and clips.
- `editor/useEditorPlayback.ts` owns media clock/playback synchronization.
- `editor/useEditorPersistence.ts` owns save/restore of editor state.
- `editor/useEditorExport.ts` owns the renderer side of export requests.
- `editor/useEditorMediaActions.ts` owns import/remove media behavior.
- `editor/usePreviewLayoutControls.ts` owns mouse dragging/resizing in preview.
- `editor/useTimelineController.ts` is a facade that assembles the timeline
  feature from focused hooks: `useTimelineEditing` (commit/undo/split/delete +
  library sync), `useTimelineDragInteractions` (pointer drags),
  `useTimelineClipboard` (copy/cut/paste), `useEditorEffects` (zoom/speed/
  subtitle CRUD), `useSubtitleGeneration` (Whisper), and `useEditorShortcuts`
  (keyboard).
- `editor/*-utils.ts` files contain pure helpers that are easier to test.

## Commenting Rule

Use comments for non-obvious boundaries, race conditions, OS behavior, and media
timing. Avoid comments that restate a function name or a single assignment.

## Size Rule

Try to keep new files under about 300 lines. Some orchestrators may be larger,
but once a section has a stable responsibility, move it to a hook, component, or
utility module.
