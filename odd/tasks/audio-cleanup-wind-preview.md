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

## Tasks

- [x] T1 (S1, S2) Reproduce the current filter on a synthetic speech+wind signal and identify why it muffles voice and leaves wind. Route: inline.
- [x] T2 (S2, S4) Replace the wind/room filter chain with a speech-preserving local filter and regression-test it. Route: inline.
- [x] T3 (S1, S3) Apply audible cleanup in preview through the existing audio graph. Route: inline.
- [x] T4 (S1-S5) Verify, commit in reviewable slices and rebuild/relaunch the app. Route: inline. Final rebuild and relaunch verified.
- [ ] T5 (S6, S7) Replace static filters with local arnndn and render preview audio with the same engine. Route: inline.

## Log

- L1 (user, verbatim): "La cancellazione del rumore/vento non funziona bene, mi ovatta la voce e sento comunque brutalmente il rumore del vento, inoltre devo poterlo sentire in anteprima e non solo esportando il video".
- L2 (evidence): `buildAudioCleanupFilter` maps `wind` to `highpass=f=70..90,afftdn=nf=-34..-24:rf=-45`; the preview playback path never applies `audioCleanup`, so the setting is export-only.

- L3 (evidence): on a synthetic speech+wind signal, the old filter lowered the voice band 0.19 dB and the wind band 5.2 dB; the new `highpass + lowshelf + light anlmdn` chain lowered voice 0.93 dB and wind 8.3 dB, avoiding `afftdn` artifacts that muffled speech.
- L4 (evidence): `AudioMeter` now rebuilds a Web Audio chain (high-pass, low-shelf) when cleanup changes, and `tests/editor-audio-meter.test.ts` verifies both enabled and disabled states.

- L5 (evidence): final ad-hoc arm64 rebuild produced `release/1.0.6/Open-Video-Craft-1.0.6-mac-arm64.dmg`; the app relaunched as PID `12061`, frontmost, with window `Open Video Craft`.

- L6 (user, verbatim): "Con la cancellazione del rumore non ci siamo proprio, deve farlo dinamicamente con l'AI magari, il rumore del vento non lo toglie proprio e anzi ora in preview se lo applico, sento un altro rumore super fastidioso che si aggiunge al vento".
- L7 (decision): use FFmpeg `arnndn` with the public `cb.rnnn` RNNoise model (public-domain model data per GregorR/rnnoise-models) and render a local WAV for preview so preview and export share one engine.
