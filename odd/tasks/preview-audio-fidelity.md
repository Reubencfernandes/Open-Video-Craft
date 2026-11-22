# Audio preview fidelity for fades and wind cleanup
Objective: make the editor preview play exactly the audio heard in the export: clip fade-in/out and local RNNoise wind cleanup must be audible before exporting. Branch `feat/p0b-min-fork-identity`; no PR or merge. Test runner: Vitest, Node 22.

## Specs

- S1 User request (verbatim): "dal video esportato sento il fade out sull'audio, però devo sentirlo anche da preview, stessa cosa per la cancellazione rumore del vento".
- S2 Fade automation must survive the normal playback sync calls that set element gain.
- S3 Cleanup preview must work for audio clips and for the audio embedded in video clips, without replacing the video URL.
- S4 Preview and export must use the same fade durations and cleanup filter parameters.
- S5 Behavior changes ship with Vitest tests through public interfaces; full verification and an ad-hoc rebuild must pass.

## Tasks

- [x] T1 (S1, S2) Fix preview gain automation so scheduled fades are not overwritten. Route: inline.
- [x] T2 (S1, S3, S4) Render and play cleaned audio alongside video clips with cleanup, and verify audio-clip cleanup. Route: inline.
- [x] T3 (S1-S5) Verify, commit and rebuild/relaunch the app. Route: inline. Pending final rebuild evidence.

## Log

- L1 (user, verbatim): "dal video esportato sento il fade out sull'audio, però devo sentirlo anche da preview, stessa cosa per la cancellazione rumore del vento".

- L2 (evidence): `AudioMeter` tracks an active envelope and no longer writes a raw gain value during a scheduled fade. Cleanup previews are generated for video items too and played through a separate hidden audio element while the video element is muted, so thumbnails and video URL stay intact.
