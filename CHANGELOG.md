# Changelog

All notable changes to Open Video Craft are documented here.

## [Unreleased]

## [1.2.1] - 2026-07-11

### Added

- Recent-project cards now load real screen or camera thumbnails through the secure project-media protocol.
- The homepage footer now shows the installed release version, a Discord contact action, and a Changelog action.
- A centered changelog dialog summarizes the latest homepage and editor changes.
- App update checks, download progress, failures, and restart actions now use the shared animated notification card.
- The Media category has a dedicated metadata inspector for the selected asset.

### Changed

- Removed the duplicate Project Library section, Voice Changer placeholder, profile circle, and decorative homepage borders.
- The editor's right inspector now renders exactly one panel for the selected rail category instead of mixing global Video, Audio, and Zoom tabs with contextual tools.
- Speed controls now appear only in the Speed category.
- Success and error notifications use a smaller animated bottom-right card with copyable error details.
- New projects now start with the warm Ember canvas instead of a blue or purple background.

### Fixed

- Project thumbnails no longer use generic generated artwork when recorded screen or camera media is available.
- Real project and timeline thumbnails now decode through CORS-enabled custom media protocols in both development and packaged builds.
- Update download progress no longer competes with a separate native restart dialog.
- Selecting Media no longer displays unrelated Layout controls in the right inspector.
- Audio-clip Bézier curves now grow and contract live with each source's dB gain and collapse when muted.

## [1.2.0] - 2026-07-11

### Added

- A fully redesigned dashboard launcher with persistent navigation, primary workflow cards, project search, generated project artwork, and a responsive recent-project library.
- A four-pane editor workspace with a persistent media browser, central preview transport, right-side Video/Audio/Zoom inspector, and full-width multi-track timeline.
- Layered cubic Bézier curves for audio clips on the timeline, generated deterministically and tested independently.
- Dedicated video transform, position, rotation, flip, compositing, opacity, and speed controls in the editor inspector.

### Changed

- Launcher and editor presentation code is divided into focused, documented components so state orchestration remains separate from visual controls.
- Editor tool names now match their actual behavior: Zoom, Speed, Layout, Overlays, Audio, Text, Cut, and Media are all directly accessible.
- Timeline, media cards, preview controls, and project cards use a consistent dark surface and violet-accent design system.

### Fixed

- Restored direct access to the Speed tool after the editor redesign.
- Removed misleading Effects and Transitions labels from tools that actually controlled Zoom and Layout.

## [1.1.3] - 2026-07-11

### Added

- The floating recorder now shows a **live camera preview as soon as you enable the camera**, so you can frame yourself before recording (not just once recording starts).
- **Screen and camera quality pickers** in the recorder: screen captures at Native (full display) by default with 1440p/1080p/720p downscale options, and the camera records real HD (1080p / 720p / 480p) instead of the low browser default.

### Changed

- The recorder's minimize button now performs a **real OS minimize** to the dock/taskbar instead of collapsing into the compact pill.
- Deleting a project from the launcher now **moves its folder to the Trash** (after a confirmation) and removes it from the recent list, instead of only forgetting it while leaving the files on disk.
- The default editor background is now **Teal Wave**.

### Fixed

- **Video thumbnails now appear reliably** on both the timeline clips and the Setup/media grid. Thumbnail capture no longer hangs forever on chunked recordings (every step is time-bounded and waits for a real decoded frame), and the result is shared between the timeline and media panel.
- System-audio tracks that captured no real samples no longer register an empty, unplayable WAV that produced a "no supported sources" error in the editor.

## [1.1.2] - 2026-07-11

### Added

- The floating recorder now shows a live camera preview above the record button while recording, so you can see your framing without switching windows.
- Record system audio is now a dedicated control in the recorder's device row, alongside Mic, Project, and Camera, making it easy to toggle before you start.

## [1.1.1] - 2026-07-10

### Fixed

- The Speed tool's left-rail button now uses the full-size speedometer artwork like every other tool, instead of a small icon inside a tinted box.

## [1.1.0] - 2026-07-10

### Added

- Record system/desktop audio: a toggle in the floating recorder captures loopback audio (Windows, and macOS 13+ via ScreenCaptureKit) as its own editable track, with a graceful fall back to a video-only capture where the OS does not support it.
- Timeline horizontal zoom: zoom the time axis in and out (with a Fit control) to work on clips precisely, in addition to the existing vertical panel resize.
- Copy, cut, and paste timeline clips (`Ctrl/Cmd+C`, `Ctrl/Cmd+X`, `Ctrl/Cmd+V`); paste drops at the playhead.
- Keyboard shortcuts: arrow keys seek 1s, `Shift`+arrows 10s, `Ctrl/Cmd`+arrows 60s; `Ctrl/Cmd+B` blades the selected clip at the playhead; `Ctrl/Cmd+E` opens export.
- Subtitle clips can now be dragged and trimmed along the timeline, keeping word-level karaoke timings aligned.
- Audio levels are shown and edited in decibels (0 dB = unity) with up to a +12 dB boost for master and per-source, plus a live green/amber/red output meter during playback.

### Fixed

- The recording border no longer renders as oversized bands that obstruct clicks on Windows; it is now a single thin, semi-transparent, click-through, capture-excluded outline you can see through.
- Imported videos now show a real thumbnail in the media panel (the capture no longer taints the canvas).
- Background music added from the Audio tool now appears on the timeline and plays.
- Clips ease smoothly into place when the timeline reflows after a drop or delete.
- UI chrome text and buttons are no longer accidentally text-selected or shown with a text cursor.
- The macOS release workflow now rejects updater ZIPs unless they are signed by the expected Developer ID team, strictly valid, notarized, and correctly represented in `latest-mac.yml`.
- macOS signature failures now explain how to recover instead of exposing a raw ShipIt error.

## [1.0.10] - 2026-07-10

### Added

- Portable, project-owned editor saves in `editor.json`.
- Imported video, audio, and custom-background assets are copied into the project so edits reopen after an app restart or on another machine.
- The supplied speedometer artwork is now used throughout the Speed tool.

### Fixed

- Project metadata writes are serialized and written atomically, preventing multi-track recording chunks from corrupting `project.json`.
- Save now includes timeline edits, effects, subtitles, audio choices, trim range, custom backgrounds, and imported-media metadata.
- Restoring a project waits for its media before synchronizing the timeline, so saved cuts and clips are not discarded on launch.
- Recording windows cannot be closed while a capture is active; stopping or cancelling safely drains the recording first.
- Packaged builds no longer include the unused multi-platform FFprobe bundle.
- Release workflows reject tags that do not match `package.json`.

## [1.0.9]

### Fixed

- Resolved FFmpeg binary lookup from `app.asar.unpacked` in packaged builds.
