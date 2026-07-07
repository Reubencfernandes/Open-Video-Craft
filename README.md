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

## Codebase Structure

The source code is split by runtime and feature. See [src/README.md](src/README.md)
for where main-process services, preload IPC, renderer components, editor hooks,
and utility modules live.

## Releases And Auto Updates

Packaged builds check the configured GitHub release feed on startup and every four hours. Updates download automatically, install on app quit, and prompt the user when a restart can finish installation.

```sh
npm run dist:win
npm run dist:mac
```

macOS release builds require a Developer ID Application certificate and notarization credentials. Set one of the notarization credential groups before running `npm run dist:mac`:

- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`
- `APPLE_KEYCHAIN_PROFILE`, optionally `APPLE_KEYCHAIN`

Ad-hoc builds are still available for trusted local testing with `npm run dist:mac:adhoc`, but public auto-updating Mac releases should use Developer ID signing and notarization.

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
