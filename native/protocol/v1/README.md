# Capture helper protocol v1

`ovc-capture-poc` writes one JSON object per line to stdout. Every line has
`v: 1`, a monotonic `seq`, a decimal-string `tHostNs`, and an `event` name.
`…HostNs` fields are decimal strings because host-clock values exceed 2^53;
a JSON number is rejected by `parseProtocolV1Line`.

Events:

- `session.start` — codec, fps, duration, output directory, shared anchor.
- `devices` — enumerated displays, cameras, microphones and system-audio mode.
- `stats` — one per second of capture time, with written and dropped frames.
- `track.first_pts` — first host timestamp of a track.
- `pauses` — pause range on the host clock (`method B`: gap on the capture axis).
- `track.finalized` — per-track manifest data, including rollover `segments`.
- `session.finalized` — final status, path and track list.
- `device.lost` — live-only loss notification; the remaining tracks continue.

`schema.json` is the shared contract. `src/shared/capture/protocol.ts` is the
strict TypeScript reader; it validates version, event name, field types and
decimal host strings, and rejects unknown or truncated input.
