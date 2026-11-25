# ADR-0004: Time model — flick ticks with explicit conversion boundaries

- **Status:** Proposed (decided in principle; verified by the P3.1 property tests).
- **Date:** 2026-11-15
- **Deciders:** Project owner
- **Plan reference:** [0000](0000-architecture-roadmap.md) §2c

## Context

The v2 document stores float seconds. Ripple math, frame snapping and sample-accurate audio need exact arithmetic, and capture produces host-clock timestamps while WebCodecs uses microseconds.

## Decision

| Type | Unit | Allowed in | Field suffix |
|---|---|---|---|
| `Ticks` | 1/705,600,000 s (flick), safe integer | Domain document, operations, history, scene evaluator, audio plan | `…Ticks` |
| `HostNs` | nanoseconds of the capture host clock, decimal string in JSON | Capture manifest and helper protocol only | `…HostNs` |
| `Micros` | microseconds | Only at the WebCodecs boundary, never stored | `…Micros` |
| `Seconds` | seconds (float) | UI display, v2 migration input, MCP/agent API, ffmpeg argv, WebAudio scheduling | `…Sec` |

A tick is about 1.417 ns and divides the frame durations of 24, 25, 30, 48, 50, 60 and the 1001-based rates, and the sample periods of 44.1, 48 and 96 kHz, exactly. The JS safe-integer horizon is about 147.7 days. A field's suffix is part of its name and is enforced by a schema-walking test. Conversions happen only in `src/shared/time/convert.ts` at eight named boundaries (helper→importer, probe→domain, domain→WebCodecs, domain→frame grid, domain↔MCP, domain→ffmpeg, domain→WebAudio, v2→v3 migration), using `bigint` for rational and nanosecond math and always converting from absolute values, never accumulating.

## Consequences

- Removes float drift; makes units visible at every call site.
- Conversions to decimal seconds are lossy by ≤ 0.5 ns at the ffmpeg boundary only.
- v2 documents migrate with rounding to the nearest tick; one-tick overlaps are snapped.
