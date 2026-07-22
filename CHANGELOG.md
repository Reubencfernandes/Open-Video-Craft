# Changelog

All notable changes to Open Video Craft are documented here.

## [Unreleased]

## [1.0.2] - 2026-07-22

Timeline editing is more predictable, subtitle timing stays anchored to the
timeline, and the release pipeline now validates both production bundles and
the bundled MCP server.

### Added

- CI coverage for the production build and the end-to-end MCP smoke test on macOS and Windows.
- A fast, smooth red playback beam along the subtitle spine plus a red active-cue card.

### Changed

- Subtitle cue cards stay sorted by timeline time after moves or trims, show read-only start/end timestamps, and direct timing changes to the draggable timeline clip.
- Refreshed the launcher, recorder, editor, and subtitle timeline screenshots for the 1.0.2 interface.
- Synchronized the app, in-app release notes, MCP handshake, changelog, and documentation on the 1.0.2 release line.
- Added an in-package FFmpeg source-code offer and a verified source/build-script bundle to the v1.0.2 GitHub release.
- Release metadata now states that macOS builds are signed/notarized and that Windows v1.0.2 artifacts are withheld pending reproducible, source-complete FFmpeg provenance.
- Removed the inactive project-filter/settings icon beside the dashboard search.

### Fixed

- Native undo/redo remains available while typing in text inputs and editable regions.
- Subtitle cues use an exact half-open time boundary, preventing two adjacent cues from appearing active on the same frame.
- Timeline Cut removes only the primary clip copied to the single-item clipboard, preserving the rest of a multi-selection and unrelated timed items.
- Sidecar subtitle export creates `.srt` files exclusively, preserves video output when a collision is found, and keeps burn-in subtitles in scoped temporary storage.

## [1.0.1] - 2026-07-21

### Changed

- Refreshed the application icon across the renderer, macOS, and Windows packages.
- Advanced the public stable package and updater version from 1.0.0 to 1.0.1.

## [1.0.0] - 2026-07-21

The first stable Open Video Craft release. This resets the public version line
after the beta series and brings the recorder, editor, and local-first export
workflow together as one production-ready desktop app.

### Added

- Select all displays or a specific screen directly from the floating recorder before recording.
- Expand a subtitle cue in place to edit its text and precise start/end timecodes with a smooth transition.
- Shared status-pill prompts for optional AI provider API keys throughout the editor.

### Changed

- Redesigned the floating recorder around a larger camera preview, the Open Video Craft logo, flatter quality controls, and a clear red recording button.
- Refreshed the launcher, recorder, editor, and subtitle documentation screenshots to match the stable interface.
- Subtitle cues now show millisecond-accurate `MM:SS.mmm` timestamps instead of rounded or raw decimal values.
- Gemini and Cohere setup prompts now use distinct blue/cyan and green liquid-glass palettes.

### Fixed

- Restored the launcher and floating-recorder screenshot assets and made the screenshot capture workflow more reliable.
- Subtitle time editing accepts seconds, `MM:SS`, and `HH:MM:SS` input while preserving valid cue ordering.
- Claude Code now appears immediately in AI settings with a clear checking state while CLI detection completes.

> **Pre-stable development history:** the version headings below record
> internal development builds. They were not published as stable GitHub
> releases and do not supersede the public 1.0.x line.

## [1.5.0] - 2026-07-13

Editor UI polish, a redesigned custom zoom-curve editor, and a fix for on-device speech-to-text that never loaded its runtime in packaged builds.

### Added

- The custom zoom curve is now edited by dragging its two control points directly on the curve surface (with a live preview marker and a `cubic-bezier(…)` readout), replacing the four X/Y sliders.

### Changed

- Recolored the zoom, subtitle, and audio tool accents from amber to purple to match the timeline accent (curve, handles, easing badge, scale/gain sliders, subtitle selection).
- Subtitle style picker is now a uniform 2×2 grid, and the Whisper explainer paragraph was removed from the Subtitles panel.
- Speed panel no longer shows the redundant Start/End numeric inputs; timing is set by dragging the section on the timeline.
- Home launcher: removed the non-functional notifications bell and the decorative project-card menu icon; the empty-preview placeholder now sits in a readable chip.

### Fixed

- On-device speech-to-text no longer fails with "no available backend found": the ONNX Runtime wasm files are bundled next to the renderer and loaded locally instead of from the jsdelivr CDN (which the renderer's content-security-policy blocks), and it runs single-threaded so it works over `file://`.
- The Whisper model download progress is now aggregated across all model files into one monotonic percentage, so it no longer jumps up and then drops back as each file starts.

## [1.4.0] - 2026-07-12

Editor workflow improvements — drag-and-drop media import, in-place project renaming, and a refreshed timeline look — plus a more reliable return to the launcher and an internal refactor of the main process and project store.

### Added

- Drag and drop video, image, or audio files directly onto the media panel to import them, in addition to the Import Media button.
- The project name in the editor top bar is now editable: rename an existing project (persisted to disk) or set the name for a brand-new edit before it is first saved.

### Changed

- Speech-to-text now runs the `onnx-community/whisper-base` ONNX build of Whisper base (full precision), the maintained Transformers.js-compatible conversion.
- Timeline accent recolored from amber to purple (playhead, timecode pill, clip selection, and the effects track), and the media filter tabs and their selected state were restyled.
- The Import Media button now shows a single icon, timeline media clips no longer show a per-clip type icon next to the file name, and the divider between the tool rail and media panel was removed.
- Refactored the Electron main process and on-disk project store into smaller, cohesive modules (IPC request validation, subtitle/SRT export, the video export flow, and project path/file-IO helpers) with no behavior change.

### Fixed

- "Back to main menu" now reliably returns to the launcher; the unsaved-changes guard could previously abort the navigation silently, making the button appear dead.
- Editing imported media before the project is saved no longer opens a native folder-picker dialog on every autosave (and no longer loops on a misleading "A project folder is required" error); the save folder is requested only on an explicit save.

### Removed

- The preview "capture frame" and "enter fullscreen" buttons (non-functional placeholders) and the audio meter's "Mixed peak" readout row.

## [1.3.2] - 2026-07-12

Full-codebase audit hardening pass: correctness, performance, and security fixes across the recorder, editor, and main process.

### Fixed

- Preview and timeline media are now loaded with anonymous CORS, so the Web Audio meter graph is no longer fed CORS-tainted sources — microphone, system, background, and imported-video audio play (and meter) instead of going silently muted.
- Restored a minimal macOS application menu (app/edit/window roles) so clipboard and window shortcuts (Cmd+C/V/X/A, Cmd+Q/W/H) work again in editor text fields; Windows keeps its menu-less chrome.
- Stopping during the recording countdown — via the global shortcut or a recorder window close — now discards the pending project instead of leaving it stuck in "recording"; a forced recorder close also marks the recording failed so it can never linger.
- A camera, microphone, or system-audio device unplugged mid-recording now raises a warning instead of ending its track silently.
- Files imported with an unsupported or missing extension are rejected at import time with a clear message, instead of wedging the 1.5s autosave in a permanent error-retry loop.
- Exported subtitle sidecars are sanitized (internal blank lines and stray `-->` no longer corrupt cues) and written with CRLF for broader player compatibility.
- Exporting to a filename without an extension no longer silently overwrites an existing file once the format extension is appended.
- Recordings longer than an hour now display as `H:MM:SS`, and non-finite recorded durations are coerced to a safe value.

### Changed

- The editor no longer rebuilds and `JSON.stringify`s the entire project on every playback frame; the autosave snapshot and its signature are memoized on the actual edited state, removing a large per-frame allocation/serialization cost during playback.
- Playback audio now resumes on its own after the window regains focus or the machine wakes from sleep, instead of staying silent until the next manual play toggle.
- FFmpeg jobs run with reduced logging and a bounded error buffer, and any in-flight FFmpeg child is terminated when the app quits so an export or remux can't outlive the app.
- Project metadata writes retry briefly when a sync agent or antivirus scanner transiently locks the file (OneDrive/Dropbox/Windows AV).
- Launcher and Speed-tool iconography moved to inline Lucide icons, dropping the bundled speedometer image; documentation and screenshots refreshed.

### Security

- The recording-start IPC payload is validated, oversized recording chunks are rejected, and new project folders can only be created under a directory the user granted through the folder picker.
- The Content Security Policy now explicitly allows the app's custom `ovc-media:`/`ovc-import:` schemes for renderer `fetch()` (waveforms, transcription, thumbnails), so a future Chromium tightening can't break them.

## [1.3.1] - 2026-07-12

### Added

- Debounced editor autosave with dirty-state tracking and an unsaved-changes close guard.
- Subtitle sidecar export: projects with subtitles now produce a synchronized `.srt` file beside the exported video.
- CI verification for every push and pull request, plus the repository's ISC license file.
- Download progress for the on-device Whisper model, whose pipeline is cached for repeat transcriptions.

### Changed

- Migrated speech-to-text from the abandoned `@xenova/transformers` package to `@huggingface/transformers` and removed unused/heavy renderer dependencies.
- The export dialog now states exactly which editor features are included and which composition effects are not yet rendered.
- The global stop shortcut is registered only while recording, and production DevTools are disabled unless explicitly enabled.
- GitHub releases are assembled as drafts and published only after all updater metadata and installers upload successfully.

### Fixed

- Added a single-instance lock and serialized recent-project index writes to prevent concurrent metadata loss.
- Hardened recorder shutdown against renderer crashes, stuck close requests, repeated failure handling, and misleading device/MediaRecorder errors.
- Validated all numeric export IPC fields and versioned editor snapshots before applying untrusted persisted state.
- Added a strict Content Security Policy, removed runtime font loading, and blocked unexpected renderer navigation and popup windows.
- System and background audio retain their per-track volume and mute settings during export, while subtitle timing respects the selected trim range.

## [1.3.0] - 2026-07-11

### Added

- Customizable zoom easing with Linear, Ease In, Ease Out, Smooth, and editable cubic Bezier curves that persist with project saves.
- A persistent launcher update card showing available versions, download progress, and a Restart action when an update is ready.
- The official Discord community action linked to `https://discord.gg/ZeDvfMvWwf`.

### Changed

- Layout now appears directly after Media and once again exposes screen-only, camera-only, camera-bubble, side-by-side, overlap, and presenter presets.
- The tool rail and media library now share one continuous bordered surface, while selected tools use a clean color state without an extra border or side marker.
- Editor terminology now uses Subtitles and Style consistently, with the dedicated speedometer artwork retained for Speed.
- Select controls, the export dialog, destructive selection actions, and typography now follow the neutral black, white, and amber editor theme.
- The editor top bar now uses a clear Save action with an in-progress state instead of an icon-only camera button, and the unused Settings action has been removed.
- Zoom curve controls were extracted into a focused component to keep the main Zoom panel compact.
- Recent-project cards now stay compact when only one or two projects exist, and use sharper poster captures.
- Audio preview now routes every source through per-source and master Web Audio gain nodes so positive dB boosts are audible.

### Fixed

- Reconnected the existing full Layout panel after the redesigned inspector had accidentally replaced it with transform-only controls.
- Save actions now share a single in-flight operation, preventing duplicate project writes from repeated clicks or shortcuts.
- Older saved projects without easing metadata receive a smooth backward-compatible zoom curve.
- Editing a zoom curve now animates the selected entry ramp in realtime and shows a moving progress marker.
- The audio meter now measures the actual mixed PCM output in dBFS, preserves clipping, and displays persistent green, amber, and red zones.
- Preview and export now share per-source gain/mute behavior; system audio is included and background music no longer uses a hardcoded export level.

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
