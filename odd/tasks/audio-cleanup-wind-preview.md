# Wind cleanup quality and audible preview
Objective: reduce wind/room noise without muffling speech, and let the owner hear the cleanup in preview before exporting. Branch `feat/p0b-min-fork-identity`; no PR or merge. Test runner: Vitest, Node 22.

## Specs

- S1 User request (verbatim): "La cancellazione del rumore/vento non funziona bene, mi ovatta la voce e sento comunque brutalmente il rumore del vento, inoltre devo poterlo sentire in anteprima e non solo esportando il video".
- S2 The export filter must reduce low-frequency wind while preserving the speech band; it must not rely on an aggressive `afftdn` floor that muffles voice.
- S3 The same cleanup must be audible in the editor preview while the setting changes, without requiring an export.
- S4 Existing presets (`wind`, `room`, `steady`), strength 0–100, saved projects and AI `set_audio_cleanup` operations must remain compatible.
- S5 Behavior changes ship with Vitest tests through public interfaces; full verification and an ad-hoc rebuild must pass.
- S6 User follow-up (verbatim): "Con la cancellazione del rumore non ci siamo proprio, deve farlo dinamicamente con l'AI magari, il rumore del vento non lo toglie proprio e anzi ora in preview se lo applico, sento un altro rumore super fastidioso che si aggiunge al vento".
- S7 Use local FFmpeg `arnndn` with a bundled RNNoise model as the cleanup engine. Preview must play audio rendered by that same filter, not a Web Audio approximation that can introduce artifacts.
- S8 User follow-up (verbatim): "Non vedo più le clip dei video nè sento le clip audio, sono vuote in preview, occupano spazio nella timeline ma prima vedevo l'anteprima e ora no, non sento nè vedo nulla quando faccio play".
- S9 Cleanup preview may replace only `kind: "audio"` media URLs. Video items must keep their original media URL; embedded video audio still uses the export filter.

## Tasks

- [x] T1 (S1, S2) Reproduce the current filter on a synthetic speech+wind signal and identify why it muffles voice and leaves wind. Route: inline.
- [x] T2 (S2, S4) Replace the wind/room filter chain with a speech-preserving local filter and regression-test it. Route: inline.
- [x] T3 (S1, S3) Apply audible cleanup in preview through the existing audio graph. Route: inline.
- [x] T4 (S1-S5) Verify, commit in reviewable slices and rebuild/relaunch the app. Route: inline. Final rebuild and relaunch verified.
- [x] T5 (S6, S7, S8, S9) Replace static filters with local arnndn, render audio-only preview and never replace video media URLs. Route: inline.

## Log

- L1 (user, verbatim): "La cancellazione del rumore/vento non funziona bene, mi ovatta la voce e sento comunque brutalmente il rumore del vento, inoltre devo poterlo sentire in anteprima e non solo esportando il video".
- L2 (evidence): `buildAudioCleanupFilter` maps `wind` to `highpass=f=70..90,afftdn=nf=-34..-24:rf=-45`; the preview playback path never applies `audioCleanup`, so the setting is export-only.

- L3 (evidence): on a synthetic speech+wind signal, the old filter lowered the voice band 0.19 dB and the wind band 5.2 dB; the new `highpass + lowshelf + light anlmdn` chain lowered voice 0.93 dB and wind 8.3 dB, avoiding `afftdn` artifacts that muffled speech.
- L4 (evidence): `AudioMeter` now rebuilds a Web Audio chain (high-pass, low-shelf) when cleanup changes, and `tests/editor-audio-meter.test.ts` verifies both enabled and disabled states.

- L5 (evidence): final ad-hoc arm64 rebuild produced `release/1.0.6/Open-Video-Craft-1.0.6-mac-arm64.dmg`; the app relaunched as PID `12061`, frontmost, with window `Open Video Craft`.

- L6 (user, verbatim): "Con la cancellazione del rumore non ci siamo proprio, deve farlo dinamicamente con l'AI magari, il rumore del vento non lo toglie proprio e anzi ora in preview se lo applico, sento un altro rumore super fastidioso che si aggiunge al vento".
- L7 (decision): use FFmpeg `arnndn` with the public `cb.rnnn` RNNoise model (public-domain model data per GregorR/rnnoise-models) and render a local WAV for preview so preview and export share one engine.

- L8 (evidence): `arnndn` with `cb.rnnn` at strength 50 reduced hiss by ~5.3 dB more than the static chain, while keeping voice-band loss around 1.5 dB; GPU/static Web Audio filters were removed so preview cannot add synthesis artifacts.
- L9 (evidence): cleanup preview now runs `audio:prepare-cleanup` in the main process, renders a WAV with the same `buildAudioCleanupFilter` used by export, and registers it for the renderer's media URL. `tests/audio-cleanup.test.ts`, `audio-model-path.test.ts`, `composition-export.test.ts`, `editor-audio-meter.test.ts` and request validation cover the path.
- L10 (evidence): 513 Vitest tests passed, typecheck, build, MCP smoke, FFmpeg verification, audit high and `git diff --check`; final ad-hoc build bundled `Resources/models/cb.rnnn` and the app relaunched as PID `13244`, frontmost.

- L11 (evidence): the saved project had cleanup settings on three video item IDs; the first preview implementation rendered 180 MB WAVs for those videos and replaced their `url`, causing blank preview and silence. The fix skips every item whose kind is not `audio`.

- L12 (evidence): the regression fix skips non-audio media when substituting cleanup preview URLs, with `tests/cleanup-preview-media.test.ts` as a guard. Final app relaunch PID `7457`. Stale generated WAVs in userData were left untouched because deletion was blocked by the safety policy.

- L13 (evidence): real clip audio was measured with six arnndn models. `lq.rnnn` reduced the 20–200 Hz wind band most while preserving 300–3400 Hz speech. New wind mapping uses high-pass 90–220 Hz and mix 0.35–1.0; at strength 30 wind fell from -24.72 dB to -28.07 dB versus -25.54 dB with the old model/filter.

- L14 (evidence): final ad-hoc rebuild bundling `lq.rnnn` relaunched the app as PID `58405`, frontmost.
