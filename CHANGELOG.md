# Changelog

All notable changes to Open Video Craft are documented here.

## [Unreleased]

### Fixed

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
