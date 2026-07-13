<div align="center">

<img src="src/renderer/assets/app.png" alt="Open Video Craft" width="96" />

# Open Video Craft

**Record your screen, camera, and audio — then cut, mix, subtitle, and export locally. No account and no upload.**

[![Latest release](https://img.shields.io/github/v/release/Reubencfernandes/Open-Video-Craft?label=download&color=34d399)](https://github.com/Reubencfernandes/Open-Video-Craft/releases/latest)
[![Platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Windows-6366f1)](https://github.com/Reubencfernandes/Open-Video-Craft/releases/latest)
[![Built with Electron](https://img.shields.io/badge/Electron%2043-React%20%2B%20TypeScript-38bdf8)](#development)

</div>

![The editor with the timeline, subtitle lanes, and karaoke subtitle overlay](docs/screenshots/editor-timeline.png)

## What it does

Open Video Craft is a desktop screen studio in two parts:

1. **A floating recorder** captures your selected display with optional camera,
   microphone, and **system audio** tracks — each saved as its own file inside a
   plain project folder you can open, move, or back up like any other folder.
2. **A timeline editor** opens the recording (or any imported media) for
   editing: cut, move, trim, copy/paste, zoom-in effects, speed ramps,
   AI-generated subtitles, camera layouts, backgrounds, and dB-based audio
   mixing. FFmpeg exports MP4, WebM, or MOV, and subtitles can be written as a
   synchronized `.srt` sidecar.

Everything runs locally. Even the speech-to-text subtitles use an on-device
Whisper model — your recordings never leave your machine.

## Screenshots — v1.3.1

| Launcher | Floating recorder |
| :---: | :---: |
| ![Launcher with recent projects](docs/screenshots/launcher.png) | ![Floating recorder controller](docs/screenshots/recorder.png) |

| Layout tool | Timeline & subtitles |
| :---: | :---: |
| ![Editor layout presets and live preview](docs/screenshots/editor.png) | ![Timeline with clips and subtitle lane](docs/screenshots/editor-timeline.png) |

## Features

### Recording

- Floating always-on-top recorder with pause/resume, countdown, and a compact pill mode.
- Screen, camera, microphone, and **system/desktop audio** as separate tracks.
- A subtle, click-through border marks the recorded display (and is excluded
  from the capture itself).
- Crash-safe: media is written to disk in chunks while you record.
- Recorder crashes and failed device acquisition recover without wedging the app.

### Editing

- Multi-lane timeline: video, audio lanes, zoom, speed, and subtitle tracks.
- Move, trim, split, delete, and **copy/paste clips** — with undo/redo.
- Horizontal timeline zoom and a resizable timeline panel.
- Zoom-in effects with an adjustable focal point; speed sections up to 5×.
- Camera layouts (bubble, side-by-side, presenter…), draggable/resizable
  screen and camera, backgrounds and corner styling.
- **On-device Whisper subtitles** with word-level karaoke highlighting, plus
  manual subtitle editing and draggable subtitle clips.
- Audio mixing in **decibels** with a live output level meter; background
  music drops straight onto the timeline.
- Debounced autosave, dirty-state close protection, and safe recovery from an
  invalid or unsupported `editor.json`.
- Export to MP4 / WebM / MOV at source, 720p, 1080p, or 1440p, with microphone,
  system audio, background audio, per-track levels, and optional `.srt` subtitles.

> **Current export scope:** trim, resolution, source/system/microphone/background
> audio, gain/mute settings, and subtitle sidecars are exported. Camera
> compositing, visual layouts/backgrounds, zoom/speed effects, and split or
> reordered timeline clips are preview/editor features that are not yet rendered
> into the exported video. The export dialog shows this before every export.

### Keyboard shortcuts

| Action | macOS | Windows |
| --- | --- | --- |
| Play / pause | `Space` | `Space` |
| Seek 1 s / 10 s / 60 s | `←→` / `⇧←→` / `⌘←→` | `←→` / `Shift ←→` / `Ctrl ←→` |
| Copy / cut / paste clip | `⌘C` / `⌘X` / `⌘V` | `Ctrl C` / `Ctrl X` / `Ctrl V` |
| Split clip at playhead | `⌘B` | `Ctrl B` |
| Delete selected | `⌫` | `Delete` |
| Undo / redo | `⌘Z` / `⇧⌘Z` | `Ctrl Z` / `Ctrl Y` |
| Export | `⌘E` | `Ctrl E` |
| Toggle Chromium DevTools | `OVC_ENABLE_DEVTOOLS=1` + `Ctrl Shift I` | `F12` or `Ctrl Shift I` |

## Install

Grab the latest installer from the
[**Releases page**](https://github.com/Reubencfernandes/Open-Video-Craft/releases/latest):

- **macOS** — `.dmg` (Apple Silicon and Intel; signed and notarized)
- **Windows** — `.exe` installer

Packaged builds check for updates on startup and every four hours; updates
download in the background and install on quit.

> **macOS permissions:** the first recording asks for Screen Recording (and
> optionally Camera/Microphone) in System Settings → Privacy & Security. The
> app walks you through it.

## Project folder shape

Every recording is a normal folder — no databases, no proprietary formats:

```txt
my-recording-project/
  project.json      # recording metadata
  editor.json       # saved editor state (timeline, effects, subtitles…)
  edits.json
  subtitles.json
  imports/          # media you imported into the editor
    <asset-id>.ext
  media/
    screen.webm
    camera.webm
    mic.webm  mic.wav
    system.webm  system.wav   # system audio, when enabled
```

Paths are relative, so a project keeps working after moving folders or machines.

## Development

```sh
npm install
npm run dev        # Vite + Electron with hot reload

npm run typecheck  # main + renderer TypeScript
npm test           # vitest unit tests
npm run build      # production build
```

Built with Electron 43, React, TypeScript, Vite, and Tailwind CSS. FFmpeg is
bundled (`ffmpeg-static`) for remuxing, audio conversion, and export.

The screenshots above are generated from the current renderer, not mocked-up
artwork: with the dev server
running, `npx electron scripts/capture-screenshots.cjs` loads each app view
with a mocked IPC bridge and demo data and saves PNGs to `docs/screenshots/`.

## Releases

Releases are tag-triggered: pushing a `v*` tag that matches `package.json`
builds, signs, and publishes both platforms via GitHub Actions.

```sh
npm run dist:win           # local Windows build
npm run dist:mac           # local macOS build (signed + notarized)
npm run verify:mac-release # required shipping gate for macOS artifacts
```

macOS release builds need a Developer ID Application certificate and one of
these notarization credential groups:

- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`
- `APPLE_KEYCHAIN_PROFILE` (optionally `APPLE_KEYCHAIN`)

`verify:mac-release` validates the updater ZIP: `latest-mac.yml` checksum,
Developer ID team, designated requirement, strict signature, and the stapled
notarization ticket. Ad-hoc builds (`npm run dist:mac:adhoc`) are for local
testing only and must never be published as release assets.

## License

ISC © Reuben Chagas Fernandes
