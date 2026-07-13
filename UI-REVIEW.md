# UI Review — Open Video Craft 1.4.0

Reviewed 2026-07-13 by driving the built app (launcher, floating recorder, editor, every tool panel, and all dialogs) with Playwright and screenshotting each screen. Items marked **fixed** were implemented on the `ui-polish` branch; everything else is a recommendation.

## What already reads as high quality

- Consistent dark theme with restrained surfaces (`bg-white/[0.03–0.07]`), rounded-2xl cards, and good typography on the home screen.
- The 1.4.0 purple timeline accent (playhead, selection, effects track) gives the editor a clear identity.
- Layout presets, Style backgrounds, and the audio Safe/Hot/Clip meter are genuinely nice, differentiated features.
- Project cards with real poster thumbnails and duration badges look professional.

## Findings

### Fixed on `ui-polish`

1. **Dead notifications bell (home header).** The bell button had no click handler — pure decoy UI. Removed.
2. **Fake context menu on project cards.** The `⋮` (MoreVertical) icon was a non-interactive decoration inside the title row; it looked clickable and communicated a menu that doesn't exist. Removed (the amber warning triangle for unavailable projects stays).
3. **Stale changelog.** The dialog and release badge were hardcoded to 1.3.0 while the app is 1.4.0. `latest-release.ts` now carries the 1.4.0 notes.
4. **Custom zoom curve edited with four sliders.** X1/Y1/X2/Y2 sliders were slow and indirect. Replaced with direct manipulation: drag the two control points right on the curve surface (nearest-handle picking, pointer capture, live canvas preview while dragging, `cubic-bezier(…)` readout underneath). No sliders.
5. **Yellow/amber accents in the zoom tool.** Clashed with the 1.4.0 purple timeline recolor. Curve stroke, handles, easing badge, and the scale slider are now violet, matching the playhead/effects accent.
6. **Speed panel Start/End number inputs.** Redundant with dragging the section on the timeline and visually noisy. Removed — the panel is now Add → rate (1x–5x) → Delete.
7. **Subtitle style switcher misaligned.** Clean/Karaoke/Boxed were bare labels while the active option was a solid chip, in a cramped 4-across row — read as broken alignment. Now a uniform 2×2 grid of equal chips.
8. **Whisper explainer paragraph in Subtitles.** Removed the three-line model explanation; the Model/Language summary block stays.
9. **Unreadable preview placeholder.** "Import media or record a screen." was slate-on-gradient; now sits in a dark pill chip that stays readable over any background.
10. **Icon-only buttons missing accessible names.** Changelog button now has an `aria-label`; the removed bell/kebab no longer need them. (Refresh and delete already had `title`s.)

### Open — functional gaps that cap the "pro" feel

1. **The recorder has no source picker.** `RecorderControllerView` never receives the sources list — it auto-selects the first screen. There is no way to pick a second display, a window, or an area. This is the single biggest gap versus Screen Studio/CleanShot/Loom. Recommended: a source strip (Screen / Window / Area tabs with live thumbnails) above the record button.
2. **Export doesn't render effects yet.** The export dialog itself admits layout/backgrounds, camera compositing, zoom/speed, and split/reordered clips are not rendered. Until export parity lands, every editor feature reads as a preview-only toy. This is priority #1 for "top tier".
3. **Media can only reach the timeline by drag.** No "+ Add to timeline" on asset cards or in the inspector, and nothing tells you dragging is the mechanism. Add a hover ➕ button and a double-click-to-append behavior.
4. **Minimize/compact mode did nothing** when clicked pre-recording (window stayed expanded). Verify `setRecorderCompact` wiring outside the recording state.
5. **Recorder labels are ambiguous.** "System off" (system *audio*), "Project" (choose save folder?) — label them "System audio" and "Save to…"; the camera/mic quality dropdowns stay enabled while the device is off, which reads as broken.

### Open — polish backlog (ranked by impact)

1. **Timeline depth:** audio waveforms on clips, filmstrip thumbnails during hover-scrub, snap-to-playhead/clip-edges with magnetic guides, and a visible razor cursor for the Cut tool. This is where CapCut/Descript feel "expensive".
2. **Tool rail truncation.** At 1360×900 the rail clips mid-icon (Zoom half-visible) with no scroll affordance — add a fade + chevron, or tighten vertical padding so all eight tools fit.
3. **Tooltips with shortcuts everywhere.** Transport, undo/redo, split, delete, zoom — every icon button should tooltip its name + key (Space, ⌘Z, S…). A `?` keyboard-map overlay would complete it.
4. **Empty states.** "No subtitles" / dashed boxes are flat text; small illustrations or a one-line benefit + primary action ("Generate from audio") would lift them.
5. **Inspector unification.** Cut shows clip info, Media shows file info, Zoom/Speed show effect controls — a consistent Inspector header (name, timecode in/out, delete) across tools would feel like one product rather than five panels.
6. **Export dialog presets.** Resolution/format dropdowns are bare; pro editors lead with intent presets (YouTube 1080p, Social 9:16, GIF) plus estimated file size and a real progress bar with cancel.
7. **Search & sort for projects** (already searchable) — add sort (recent/name/duration) and a grid/list toggle once libraries grow.
8. **Focus visibility.** Custom focus rings exist on search; extend a consistent `focus-visible` ring (violet) to all interactive controls for keyboard users.
9. **Motion.** 150–200 ms ease-out transitions on panel swaps and dialog entry (scale 0.98→1, fade) — currently instant, which reads utilitarian.
10. **Home header alignment.** With the bell gone the search field floats alone; consider moving it inline with the "Recent Projects" heading and letting the greeting breathe full-width.

## Method notes

App was driven via `playwright-core` `_electron` against the dev build (`node driver.mjs`, command file + log). Native open-file dialogs were stubbed in the main process (`dialog.showOpenDialog` override via `app.evaluate`) so the real Import Media flow could run headlessly with ffmpeg-generated fixtures. Consider capturing this as a project run skill (`/run-skill-generator`) so future sessions can drive the app the same way.
