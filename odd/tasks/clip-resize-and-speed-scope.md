# Clip resizing and speed scope
Objective: allow timeline clips (video and AI-generated audio/music) to be resized down to near zero duration, and ensure speed effects change only video clips, not music on the audio track. Branch `feat/p0b-min-fork-identity`; no PR or merge. Test runner: Vitest, Node 22.

## Specs

- S1 User request (verbatim): "devo poter ridimensionare le clip, anche la musica generata con AI, i video..."
- S2 User request (verbatim): "le clip hanno un minimo di durata che non posso accorciare, devo poterle ridimensionare fino a quasi 0 secondi"
- S3 User request (verbatim): "se velocizzo il tempo di una clip deve agire solo sulle clip video, non sulla musica generata con AI presente sul canale Audio"
- S4 Every timeline clip, including AI-generated music on audio lanes, must be resizable down to a near-zero minimum instead of the current fixed larger floor.
- S5 Speed effects must alter video clip playback and export timing only. Audio-track clips must keep real-time playback and export duration.
- S6 Audio embedded in a sped-up video clip may follow that video clip; music placed on an audio lane must not.
- S7 Behavior changes ship with Vitest tests through public interfaces; full verification and an ad-hoc rebuild must pass.

## Tasks

- [x] T1 (S1, S2, S4, S6) Find the minimum-duration clamp for timeline clip trimming and lower it for all clip kinds. Route: inline.
- [x] T2 (S3, S5, S6) Exclude audio-track clips from playback and export speed processing. Route: inline.
- [x] T3 (S1-S7) Verify, commit in reviewable slices and rebuild/relaunch the app. Route: inline. Pending final rebuild/relaunch evidence.

## Log

- L1 (user, verbatim): "devo poter ridimensionare le clip, anche la musica generata con AI, i video..."
- L2 (user, verbatim): "le clip hanno un minimo di durata che non posso accorciare, devo poterle ridimensionare fino a quasi 0 secondi"
- L3 (user, verbatim): "se velocizzo il tempo di una clip deve agire solo sulle clip video, non sulla musica generata con AI presente sul canale Audio"

- L4 (evidence): UI trimming used a 0.15s floor and the `trim_clip` operation used 0.1s; both are now 0.01s. `tests/timeline-utils.test.ts` verifies a 0.01s end trim on an audio clip.
- L5 (evidence): export mixes speedable picture audio and real-time audio-lane music on separate branches; `tests/composition-export.test.ts` verifies a 2s music clip is not cut to the 1s sped-up video duration. Playback uses `getPlaybackRateForTrack` so audio clips stay at rate 1.
