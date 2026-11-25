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

## Optional input events (click sidecar)

`ovc-click-capture` emits three more v1 events. They are not part of the
mandatory capture-helper set, but they use the same envelope, sequence and
decimal-string host times, and they are what drives click-based automatic zoom.

- `display.metrics` — one per active display: `displayId`, `originXPoints`,
  `originYPoints`, `widthPoints`, `heightPoints`, `scaleFactor`, `primary`.
- `input.click` — one per global left click: `clickIndex`, `clickHostNs`,
  `button: "left"`, `displayId`, `xPoints`, `yPoints`.
- `input.permission` — the explicit Input Monitoring verdict:
  `capability: "input-monitoring"`, `status` one of `granted`, `denied`,
  `not-determined`, `unavailable`.

`display.metrics` and `input.click` share the **Quartz global display coordinate
space in points, never pixels**: the main display's top-left corner is the
origin, y grows downward, and secondary displays may have negative origins. A
click is normalized as `(xPoints - originXPoints) / widthPoints`, so Retina
scale never changes the target. Absence of clicks is never ambiguous: a helper
that cannot read the session event tap reports `denied` or `unavailable` and
exits non-zero.

`schema.json` is the shared contract. `src/shared/capture/protocol.ts` is the
strict TypeScript reader; it validates version, event name, field types and
decimal host strings, and rejects unknown or truncated input.
