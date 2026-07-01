# Open Video Craft

Open Video Craft is an Electron desktop recorder MVP for creating project-based screen recordings with separate screen, microphone, and camera tracks.

## Current MVP

- Electron 43 + React + TypeScript + Vite + Tailwind CSS.
- Display/window source picker using `desktopCapturer`.
- Secure preload API for project, recording, source, and FFmpeg actions.
- Separate recording tracks under a user-chosen project folder.
- `mic.wav` generation through FFmpeg after recording stops.
- Local preview player that synchronizes screen, camera, and audio tracks.

## Development

```sh
npm run dev
```

## Verification

```sh
npm run typecheck
npm test
npm run build
```

## Project Folder Shape

```txt
my-recording-project/
  project.json
  edits.json
  subtitles.json
  media/
    screen.webm
    camera.webm
    mic.webm
    mic.wav
```

`project.json`, `edits.json`, and `subtitles.json` use relative media paths so folders remain portable.

## Cross-Platform Follow-Up Checks

- Windows: verify display/window capture, camera, microphone, and FFmpeg conversion on a clean install.
- macOS: verify Screen Recording, Camera, and Microphone permissions, plus hardened runtime/package entitlement requirements before release packaging.
- Linux: verify behavior on X11 and Wayland separately, because source availability and permissions vary by desktop environment.
