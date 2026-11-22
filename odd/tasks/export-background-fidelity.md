# Export background and montage fidelity
Objective: make timeline exports preserve the editor background image and the existing speed effects. Branch `feat/p0b-min-fork-identity`; no PR or merge. Test runner: Vitest, Node 22.

## Specs

- S1 User request (verbatim): "Ho fatto un export ma sembra essersi perso tutto il montaggio, non vedo l'immagine di sfondo che ho messo, le parti velocizzate... verifica e correggi tutto".
- S2 The export must use the saved `backgroundStyle` and `customBackgroundImportId` from the editor document. A custom image background must appear behind video clips, including letterbox areas and timeline gaps.
- S3 Existing speed effects must remain applied: the exported duration and frames must reflect each `set_speed` region.
- S4 Existing transitions and clip order must remain intact.
- S5 A reproducible export regression test must exercise the public export API and verify background use; full local verification and ad-hoc rebuild must pass.

## Tasks

- [x] T1 (S1-S3) Reproduce the current export from the saved project and confirm which effects are already present. Route: inline.
- [x] T2 (S2, S4) Pass background selection from `composition-export.ts` into the FFmpeg timeline renderer and composite it behind clips/gaps. Route: inline.
- [x] T3 (S1-S5) Add regression tests, verify, commit and rebuild/relaunch the app. Route: inline. Final app relaunch verified.

## Log

- L1 (user, verbatim): "Ho fatto un export ma sembra essersi perso tutto il montaggio, non vedo l'immagine di sfondo che ho messo, le parti velocizzate... verifica e correggi tutto".
- L2 (evidence): the saved document has `backgroundStyle: "custom"`, `activeBackgroundCategory: "image"`, `customBackgroundImportId: "81b6467f-..."`, three video timeline segments, two crossfades and 47 speed effects. `exportEditorProjectToPath` passes `videoSegments`, `audioSegments`, transitions, zoom, speed and text overlays to `exportTimelineComposition`, but no background field.
- L3 (evidence): a direct 20-second export window around the first speed effect produced an 18.23-second MP4, confirming speed regions are already applied; the missing layer is the background.

- L4 (evidence): after wiring the background, the same 20s export window still lasted 18.23s (speed effects preserved) and a side pixel changed from RGB `(0,0,0)` to `(1,59,112)`, matching the custom background image instead of black padding.
- L5 (evidence): `tests/composition-export.test.ts` now covers both `exportTimelineComposition` with a blue background and the public `exportEditorProjectToPath` path with a saved custom background import. 499 Vitest tests passed, plus typecheck, build, MCP smoke, FFmpeg verification, audit high and `git diff --check`.

- L6 (evidence): final ad-hoc arm64 rebuild produced `release/1.0.6/Open-Video-Craft-1.0.6-mac-arm64.dmg`; the app was relaunched as PID `17871`, frontmost, with window `Open Video Craft`.
