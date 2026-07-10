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
npm run verify:mac-release
```

macOS release builds require a Developer ID Application certificate and notarization credentials. Set one of the notarization credential groups before running `npm run dist:mac`:

- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`
- `APPLE_KEYCHAIN_PROFILE`, optionally `APPLE_KEYCHAIN`

`verify:mac-release` is a required shipping gate: it checks the ZIP used by Squirrel.Mac, its `latest-mac.yml` checksum, the expected Developer ID team, the designated requirement, strict signature validation, and the stapled notarization ticket. The GitHub release workflow runs it before uploading anything.

Ad-hoc builds are still available for trusted local testing with `npm run dist:mac:adhoc`, but they must never be uploaded as GitHub-release assets or referenced by `latest-mac.yml`. Public auto-updating Mac releases must use the configured Developer ID identity and notarization.

If an ad-hoc ZIP was already published, publish a new, higher version with `dist:mac` and `verify:mac-release`. Users on the signed release must install that corrected release manually once; subsequent signed updates will work normally.

## Project Folder Shape

```txt
my-recording-project/
  project.json
  editor.json
  edits.json
  subtitles.json
  imports/
    <asset-id>.ext
  media/
    screen.webm
    camera.webm
    mic.webm
    mic.wav
```

`project.json` and `editor.json` use relative paths. Imported editor assets are copied into `imports/`, so a saved project can be reopened after an app restart or moved to another machine.

## Cross-Platform Follow-Up Checks

- Windows: verify display/window capture, camera, microphone, and FFmpeg conversion on a clean install.
- macOS: verify Screen Recording, Camera, and Microphone permissions, plus hardened runtime/package entitlement requirements before release packaging.
- Linux: verify behavior on X11 and Wayland separately, because source availability and permissions vary by desktop environment.
