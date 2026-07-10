# Changelog

All notable changes to Open Video Craft are documented here.

## [Unreleased]

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
