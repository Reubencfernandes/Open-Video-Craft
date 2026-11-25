# Editor preview and timeline fixes

Keep exported composition faithful to preview, remove preview flashes at cuts, and make multi-clip timeline editing direct and fast.

## Specs

- S1: "Sul ideo esportato non vedo il bordino sulla webcam anche se ho scelto il giusto layout e lo vedo in preview. Il video esportato deve rispecchiare al 100% quello che vedo in preview."
- S2: "In preview vedo sempre un sul video un flash quando ci sono tagli/cambi di clip video, poi sul video esportato però lo vedo bene"
- S3: "Se seleziono tutte le clip presenti in timeline, non riesco a spostarle con Drag&drop e mi sarebbe utile una funzione per eliminare gli spazi tra le clip, compresi quelli di inizio e fine, per unire facilmente e velocemente le clip orizzontalmente"
- S4: "Devo poter unire le clip se sono sullo stesso canale nella timeline e se sono adiacenti"
- S5: "Devo poter cambiare layout e/o stile anche sulla singola clip video"
- S6: "Se seleziono delle clip e premo dalla tastiera \"E\" mi fa l'HIDE (basta aggiungere lo shortcut)"
- S7: "Il tag blu che indica la transizione deve essere messo sopra alle clip su cui agisce, ne ho messa una tra 2 regi screen ma il tab blu lo vedo sulla prima webcam (primo canale video in alto)"

## Tasks

- T1 | S1 | parent/worker: make webcam border rendering consistent between preview and exported composition; add regression coverage | commit: pending
- T2 | S2 | parent/worker: remove the blank frame at preview clip cuts without changing correct export behavior; add regression coverage | commit: pending
- T3 | S3 | parent/worker: drag all selected timeline clips together while preserving their relative placement; add regression coverage | commit: pending
- T4 | S3 | parent/worker: add a command that closes timeline gaps, including leading and trailing gaps, and packs clips horizontally; add regression coverage | commit: pending
- T5 | S4 | parent/worker: group adjacent clips on the same timeline channel into one movable block, including clips from different sources, while preserving their internal media intervals; add regression coverage | commit: pending
- T6 | S5 | parent/worker: allow layout and style overrides on an individual video clip; add regression coverage | commit: pending
- T7 | S6 | parent: add the E keyboard shortcut to hide the selected clips; add regression coverage | commit: pending
- T8 | S7 | parent/worker: render each blue transition tag above the clips it affects on their actual timeline channel; add regression coverage | commit: pending

## Log

- L1: "Sul ideo esportato non vedo il bordino sulla webcam anche se ho scelto il giusto layout e lo vedo in preview. Il video esportato deve rispecchiare al 100% quello che vedo in preview."
- L2: "In preview vedo sempre un sul video un flash quando ci sono tagli/cambi di clip video, poi sul video esportato però lo vedo bene"
- L3: "Se seleziono tutte le clip presenti in timeline, non riesco a spostarle con Drag&drop e mi sarebbe utile una funzione per eliminare gli spazi tra le clip, compresi quelli di inizio e fine, per unire facilmente e velocemente le clip orizzontalmente"
- L4: Exploration evidence: preview alone implements webcam border CSS; export camera layers carry geometry and shape but no border. Preview clip cuts reuse one video element and force seeks at clip changes; export is not affected.
- L5: "Devo poter unire le clip se sono sullo stesso canale nella timeline e se sono adiacenti"
- L6: "Devo poter cambiare layout e/o stile anche sulla singola clip video"
- L7: "Se seleziono delle clip e premo dalla tastiera \"E\" mi fa l'HIDE (basta aggiungere lo shortcut)"
- L8: "Il tag blu che indica la transizione deve essere messo sopra alle clip su cui agisce, ne ho messa una tra 2 regi screen ma il tab blu lo vedo sulla prima webcam (primo canale video in alto)"
- L9: Merge product decision: user selected "Raggruppale come un’unica clip" — adjacent clips from different sources remain separate internal media intervals but are selected and moved as one timeline block.

## Progress

- T1: export now pads the webcam border inside the camera box via `resolveCameraBorder` shared by preview and export; pixel test added. Files: src/shared/editor-domain/timeline-visibility.ts, src/renderer/editor/useEditorDerivedData.ts, src/main/composition-export.ts, src/main/ffmpeg.ts, tests/composition-export.test.ts, tests/composition-layers.test.ts. Evidence: RED (ring pixel blue, resolver missing) → GREEN (border ring painted); typecheck clean.
- T2: cut continuity. `shouldSeekPrimaryVideo` no longer forces a seek when a playing decoder already sits on the next clip's first frame; `PreviewVideo` keeps two persistent decoders so a source swap shows the outgoing frozen frame until the incoming one has data (and waits for a pending seek). Files: src/renderer/editor/playback-sync.ts, src/renderer/editor/PreviewVideo.tsx, tests/playback-sync.test.ts, tests/preview-cut-continuity.test.tsx. Evidence: RED (5 assertions) → GREEN; full suite 154 files / 854 tests passed before T7-T8, typecheck clean.
- T7: `E` now toggles clip visibility like `H`, with `Cmd/Ctrl+E` still exporting. Files: src/renderer/editor/useEditorShortcuts.ts, tests/editor-shortcuts.test.ts. Evidence: temporary revert produced RED on "hides the selection with E as well as H", restored GREEN.
- T8: transition markers and drop targets render on their own channel. Files: src/renderer/editor/TimelineTracks.tsx, src/renderer/editor/TimelineClips.tsx, tests/timeline-transition-lane.test.tsx. Evidence: RED (screen transition marker only in lane 0, 2 markers on lane 0 when both channels had one) → GREEN 3/3; typecheck clean.
- T3: multi-selection drag verified at the hook seam (`tests/timeline-selection.test.ts`: selection survives the press, group moves rigidly, several channels move together). No code change was needed; the shipped behaviour is covered. Pending the human's confirmation of the exact gesture in the app.
- T5: adjacent same-channel clips form a derived block (`src/renderer/editor/timeline-groups.ts`), so pressing any member selects and moves the whole run, including clips from different sources, without any schema change. Wired in `resolveTimelineClipPress` with the drag hook and keyboard activation. Covered by `tests/timeline-groups.test.ts` (11 cases). Remaining slice: merged visual seam.
- T6: per-clip camera style (`cameraStyle` on the segment) merges over the project style through the single shared `resolveCameraStyle`, consumed by preview and by the export per composition window; LayoutPanel gained apply/clear controls. Evidence: RED then GREEN on `tests/clip-camera-style.test.ts`, `tests/editor-domain.test.ts`, `tests/composition-export.test.ts`; typecheck clean.
- Full suite after T1-T8 work: 158 files, 889 tests passed; typecheck clean.
- T3 root cause found and fixed: the snap could cancel the whole gesture. With every clip selected the only snap target is the group's own start at zero, so a short drag landed on the original position and the timeline appeared not to move at all. `moveTimelineSegmentGroup` now ignores a snap that would put the group back where it started. Evidence: RED "expected +0 to be close to 0.15" -> GREEN; legitimate snaps (a clip onto the timeline start) still work.
- T5 visual slice done: `getTimelineClipGroupRoles` / `getTimelineClipGroupRole` give each member a role so inner seams dissolve and only outer edges stay rounded, with `data-group-role` in the DOM. Evidence: RED (6 failing, missing role helper and attribute) -> GREEN 13/13.
- Suite after every change: 158 files, 897 tests passed; typecheck clean.
- Release: `npm run dist:mac` refused to build (no Developer ID Application identity, 0 valid). Rebuilt with `npm run dist:mac:adhoc`, the path this environment has used before. Artifacts (arm64 and x64) rebuilt at 19:51-19:52 local time; the packaged app.asar contains the new code markers (close-gaps, data-group-role, resolveCameraStyle). Nothing was committed; the work stays uncommitted in the worktree.
