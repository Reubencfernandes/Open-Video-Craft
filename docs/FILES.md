# File Guide

What every source file in Open Video Craft does. Structure notes and
conventions live in [`src/README.md`](../src/README.md); this file is the
per-file reference.

The app is an Electron desktop video recorder + editor. Code is split by
runtime: `src/main` (Node/Electron main process), `src/preload` (IPC bridge),
`src/renderer` (React UI), and `src/shared` (types used by all three).

## Shared (`src/shared`)

| File | Purpose |
| --- | --- |
| `types.ts` | Types shared across processes: recording tracks (`screen`, `camera`, `mic`, `system`), project files, permissions, editor imports, export requests. |
| `defaults.ts` | Factories for the default JSON files written into a new project folder (`project.json`, `edits.json`, `subtitles.json`). |

## Main process (`src/main`)

| File | Purpose |
| --- | --- |
| `main.ts` | Bootstrap and orchestrator: creates all windows (main, floating recorder, editor, permission guide, recording-border overlay), registers every IPC handler, wires modules together. The recorder window is created hidden and shown on `ready-to-show` so it appears fully painted. |
| `app-shell.ts` | App identity: app id/name, dock/about panel, platform icon path. |
| `app-status-ipc.ts` | IPC exposing app version and update status. |
| `app-version.ts` | Resolves the product version reported to renderers and project files. |
| `auto-updates.ts` | electron-updater lifecycle: checks, download progress, restart prompts, status broadcasts. |
| `desktop-permissions.ts` | Permission-request handlers (only app windows may capture), the display-media handler that picks the capture source and offers **loopback system audio**, macOS permission status/settings helpers. |
| `desktop-sources.ts` | desktopCapturer listing with fallbacks + SVG placeholder thumbnails. |
| `display-overlay.ts` | Pure geometry for the recording border: display resolution matching and strip bounds. Windows uses one transparent click-through window; macOS uses opaque content-protected strips (transparent + protected is black-screen-bugged on macOS). |
| `ffmpeg.ts` | FFmpeg: bundled-binary resolution (asar-unpacked), WebM remux for seekability, mic/system WAV conversion, export encode (mp4/webm/mov, resolution scaling, volume up to +12 dB, background-audio mixing). |
| `file-dialogs.ts` | Native dialogs: project folder, media import (with kind classification), export destination. |
| `media-protocols.ts` | `ovc-media://` and `ovc-import://` protocols. Adds CORS headers (fetch/canvas reads) and forwards Range headers (media seeking). |
| `project-library.ts` | Recent-projects index in userData; powers the launcher list and editor lookup. |
| `project-store.ts` | On-disk project store: folder creation, per-track chunk appends, stop/complete transitions, editor-state + imports persistence, safe path resolution. |

## Preload (`src/preload`)

| File | Purpose |
| --- | --- |
| `preload.ts` | Exposes the typed `window.openVideoCraft` bridge — the renderer's only path to the main process. |

## Renderer roots (`src/renderer`)

| File | Purpose |
| --- | --- |
| `main.tsx` | Entry point; mounts launcher / recorder / editor / permission guide from the `?view=` param. |
| `App.tsx` | Launcher: recent projects, open existing, start recorder. |
| `EditorView.tsx` | The editor's **composition root**. Owns editor state, wires the hooks below together, and renders the layout. Contains no editing logic itself. |
| `RecorderController.tsx` | Floating recorder state machine: source/devices, capture streams (screen/camera/mic/system audio), chunked IPC writes, pause/stop/cancel, border overlay lifecycle. |
| `AppVersionStatus.tsx` | Version/update pill. |
| `useAppUpdateStatus.ts` | Loads app/update status and subscribes to changes. |
| `app-version-status-utils.ts` | Pure formatting for the pill. |
| `PermissionGuideOverlay.tsx` | Transparent overlay window guiding macOS permission grants. |
| `PermissionOnboarding.tsx` | macOS permission onboarding flow. |
| `recording-runtime.ts` | Recording constants + MediaRecorder/getDisplayMedia option builders (incl. the system-audio flag). |
| `zoom-timing.ts` | Pure placement/drag constraints shared by zoom and speed regions. |
| `classNames.ts` | `cx()` className joiner. |
| `global.d.ts` | Ambient type for `window.openVideoCraft`. |
| `styles.css` | Global CSS: scrollbars, app-chrome text-selection/cursor rules, clip reflow-transition suppression during drags. |

## Recorder UI (`src/renderer/recorder`)

| File | Purpose |
| --- | --- |
| `RecorderControllerView.tsx` | Recorder window UI (expanded/compact), record/pause/stop, system-audio + border toggles, device pickers. |
| `FloatingDeviceControl.tsx` | Mic/camera toggle + device dropdown. |
| `recorder-utils.ts` | Stream/recorder helpers: mime candidates, optional streams, per-track MediaRecorders. |
| `source-overlay-state.ts` | Pure rule for when the screen border shows. |
| `types.ts` | Recorder types. |

## Editor (`src/renderer/editor`)

### State & logic hooks

`EditorView` composes these; each owns one concern.

| File | Purpose |
| --- | --- |
| `useEditorDerivedData.ts` | Memoized view data from raw state: media library, timeline clips/tracks, playback geometry, preview styles, selections. |
| `useEditorPlayback.ts` | Playback engine: rAF clock, video-driven timeline time, element seek/play/volume sync, stall watchdog, meter level. |
| `useEditorPersistence.ts` | Load/restore/save of project editor state (`editor.json`) and imports. |
| `useEditorMediaActions.ts` | Import/remove/select media; background music lands on the timeline; per-source audio levels. |
| `useEditorExport.ts` | Export dialog state + export request. |
| `usePreviewLayoutControls.ts` | Drag/resize of screen & camera in the preview. |
| `useTimelineViewport.ts` | Timeline panel height, horizontal time-axis zoom, pointer-X → time mapping. |
| `useTimelineController.ts` | **Facade** assembling the whole timeline feature from the six hooks below; EditorView makes one call. |
| `useTimelineEditing.ts` | Editing core: `commitTimelineSegments` (single write path), undo/redo stacks, delete, split, asset-grid drag & drop, library-sync/probe/scale/trim-range effects. |
| `useTimelineDragInteractions.ts` | Pointer state machine on the timeline body: scrub, clip move/trim, zoom/speed/subtitle drags, context menu. |
| `useTimelineClipboard.ts` | Clip copy/cut/paste at the playhead (Ctrl/Cmd+C/X/V). |
| `useEditorEffects.ts` | Zoom/speed region and subtitle create/update/remove. |
| `useSubtitleGeneration.ts` | On-device Whisper transcription; owns `sttStatus`. |
| `useEditorShortcuts.ts` | Global keyboard shortcuts (single window listener reading latest state via a ref). |

### Pure modules (unit-testable)

| File | Purpose |
| --- | --- |
| `timeline-utils.ts` | Segment math: library sync, move/trim with snapping + non-overlap, split checks, audio lanes, clip styles, duration. |
| `playback-sync.ts` | When to hard-seek media elements; timeline ↔ media time maps. |
| `zoom-utils.ts` | Active-zoom lookup and preview transform. |
| `speed-utils.ts` | Speed constants + active-rate lookup. |
| `layout-geometry.ts` | Camera frame presets and drag/resize math. |
| `camera-content-transform.ts` | CSS transform for camera pan/zoom/mirror. |
| `media-utils.ts` | Project media items, video thumbnail capture (CORS-clean), waveform blob loading, 16 kHz mono decode for Whisper. |
| `audio-utils.ts` | dB ↔ linear-percent conversion (UI is dB; storage stays percent). |
| `audio-meter.ts` | Web Audio preview graph: per-element gain, master gain, mixed PCM analyser, and clipping-aware peak sampling. |
| `subtitle-transcription.ts` | Whisper model id, word-chunk language patch, output → segments. |
| `editor-state-storage.ts` | Versioned (de)serialization of saved editor state. |
| `keyboard-utils.ts` | Typing-target detection + control blurring for shortcuts. |
| `backgrounds.ts` | Background style catalog. |
| `utils.ts` | clamp, id generation, timecode/bytes formatting, ruler ticks. |
| `types.ts` | Editor types + constants (frame rate, drag mime type). |

### Components

| File | Purpose |
| --- | --- |
| `EditorTopbar.tsx` | Back / project name / save / export. |
| `EditorNotifications.tsx` | Error + toast display. |
| `EditorToolPanel.tsx` | Routes the active tool to its panel. |
| `EditorPreviewPanel.tsx` | Preview shell, preview zoom, hidden timeline `<audio>` elements. |
| `PreviewContent.tsx` | What the playhead is over: image / composition (screen + camera) / video, subtitle overlay, edit handles. |
| `EditorTimelineSection.tsx` | Visibility wrapper forwarding props to Timeline. |
| `Timeline.tsx` | Timeline panel: transport, horizontal zoom, ruler, playhead, lanes. Presentational only. |
| `TimelineChrome.tsx` | Toolbar, ruler, playhead, context menu. |
| `TimelineTrack.tsx` | One track row (`track-lane` class is load-bearing for pointer→time). |
| `TimelineClips.tsx` | Media/zoom/speed/subtitle clip components + waveform. |
| `AssetCard.tsx` | Asset grid card with drag + decoded thumbnail. |
| `ExportDialog.tsx` | Export modal. |
| `controls.tsx` | ToolPanelHeader + RangeControl. |
| `tools.tsx` / `ToolRail.tsx` | Tool catalog / left rail. |
| `SpeedIcon.tsx` | Speedometer icon. |
| `ZoomTargetPanel.tsx` | Zoom focal-point picker overlay. |

### Panels (`src/renderer/editor/panels`) — one per tool

| File | Purpose |
| --- | --- |
| `MediaPanel.tsx` | Import + filter tabs + draggable asset grid. |
| `LayoutPanel.tsx` | Layout mode, screen scale/aspect, camera controls. |
| `CameraCropControls.tsx` | Camera pan/zoom/mirror sliders. |
| `AudioPanel.tsx` | Output meter, master dB gain, background music, per-source rows. |
| `AudioLevelMeter.tsx` | Live mixed-output dBFS meter with persistent green/amber/red zones. |
| `DbSlider.tsx` | dB-labeled gain slider (reports linear percent). |
| `ZoomPanel.tsx` / `SpeedPanel.tsx` | Add/edit zoom and speed regions. |
| `ZoomCurveEditor.tsx` | Zoom easing presets, custom cubic Bezier controls, and realtime ramp preview. |
| `ZoomCurvePreview.tsx` | Reusable SVG curve thumbnail and animated progress marker. |
| `SubtitlesPanel.tsx` | Transcription, style, per-subtitle editing. |
| `CutPanel.tsx` | Split at playhead / delete selected. |
| `StylePanel.tsx` | Backgrounds + corner styling. |

## How the editor fits together

```
EditorView (state + wiring + layout JSX, no logic)
 ├─ useEditorPersistence      load/save editor.json
 ├─ useEditorDerivedData      state -> memoized view data
 ├─ useEditorPlayback         clock + media element sync + meter level
 ├─ useTimelineViewport       panel height + h-zoom + pointer->time
 ├─ useEditorMediaActions     import/remove/select media
 ├─ useEditorExport           export dialog + request
 ├─ usePreviewLayoutControls  preview drag/resize
 └─ useTimelineController     (facade)
     ├─ useTimelineEditing            commit/undo/split/delete/dnd + sync effects
     ├─ useEditorEffects              zoom/speed/subtitle CRUD
     ├─ useSubtitleGeneration         Whisper
     ├─ useTimelineDragInteractions   pointer drags (uses editing's undo stacks)
     ├─ useTimelineClipboard          copy/cut/paste (uses editing's commit)
     └─ useEditorShortcuts            keyboard (uses all of the above)
```

All hooks receive state/setters as parameters and return handlers, so the data
flow is one-directional and none of the extraction changed behavior, re-render
patterns, or algorithmic complexity — the same functions run on the same
events; they just live in files scoped to one concern.
