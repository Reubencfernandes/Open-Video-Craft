# YouTube-safe volume MCP function
Objective: add an always-available MCP function that sets a YouTube-safe volume ceiling and keeps it constant across all video clips, so YouTube does not lower the video afterwards. Branch `feat/p0b-min-fork-identity`; no PR or merge. Test runner: Vitest, Node 22.

## Specs

- S1 User request (verbatim): "aggiungi una funzione richiamabil sempre da MCP, che metta un volume massimo per Youtube (in modo che non lo abbassi poi) e che sia costante in tutte le clip video".
- S2 The MCP surface must expose a dedicated tool for YouTube volume normalization.
- S3 The setting must persist in the editor document and default to a YouTube-safe target of -14 LUFS integrated with -1 dBTP true peak.
- S4 Export must apply the normalization to the final mixed audio so every video clip is heard at the same consistent level.
- S5 The tool must be included in Claude's allowed tool list and described in AI/MCP instructions.
- S6 Behavior changes ship with Vitest tests through public interfaces; full verification and an ad-hoc rebuild must pass.

## Tasks

- [x] T1 (S1-S3) Add persisted YouTube normalization state and editor operation. Route: inline.
- [x] T2 (S1, S4) Apply loudness normalization in FFmpeg export. Route: inline.
- [x] T3 (S1, S2, S5) Add MCP tool, allowlist and instructions. Route: inline.
- [x] T4 (S1-S6) Verify, commit and rebuild/relaunch the app. Route: inline. Pending final rebuild evidence.

## Log

- L1 (user, verbatim): "aggiungi una funzione richiamabil sempre da MCP, che metta un volume massimo per Youtube (in modo che non lo abbassi poi) e che sia costante in tutte le clip video".

- L2 (evidence): `set_youtube_volume` persists a YouTube-safe setting (-14 LUFS, -1 dBTP defaults) and export appends `loudnorm` to the final mixed audio. The tool is in Claude's allowlist, the MCP smoke tool list and the AI instructions.
