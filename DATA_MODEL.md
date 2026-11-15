# DATA MODEL — Open Video Craft macOS fork (Revision 4)

- **Baseline:** `main` @ `143a0d6`. Planning only; nothing implemented or run.
- **Companion:** `ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, `ADR.md`. Detail and rationale: `docs/adr/0000` §2c (time), ADR-3, ADR-5. Where Revision 4 differs from those files, this document wins (supersession table in `ADR.md`).
- **Tags:** **[V]** verified in code · **[S]** static/arithmetic · **[H]** hypothesis for a gate · **[P]** proposed.
- **Revision 4 scope:** §2 time arithmetic hardened; §4.1–4.2 clip timing, transitions and `CaptureSession` added; §6.3 `TimeMap` rewritten; `captureOffsetTicks` and `driftPpm` removed everywhere (never implemented: `grep` over `src scripts tests` finds neither [V]).

---

## 1. Current model (what we start from) [V]

- `EditorDocument{schemaVersion:2, revision, savedAt, state, imports, lastMutation}` (`src/shared/editor-domain/types.ts:182`).
- Flat `EditorStateSnapshot`. Clips are `TimelineSegment{track, lane, start, end, sourceStart}` in **float seconds** (`types.ts:40`): no `sourceEnd`, no track entities, no source entities.
- Zoom and speed are global effect ranges (speed limited to `1|2|3|4|5`). Layout, camera, background and corner settings are project-wide scalars.
- 31 operation kinds, applied all-or-nothing on a `structuredClone` (`operations.ts`). Migration is v1→v2 only (`schema.ts:56-78`); unknown versions return `null`.
- The editor places every recorded track at `sourceStart: 0` (`timeline-utils.ts:112`) and `project.json` holds a single `startedAt` and `durationMs`.
- `edits.json` and `subtitles.json` are written at creation and never read.

The v3 model below keeps the operation-based design and replaces the flat structure with entities, integer time and explicit synchronization data.

---

## 2. Time model (normative)

One unit per layer, one suffix per unit, conversions only at named boundaries. A schema walker fails any v3 document or MCP field whose name ends in `Us`, `Micros`, `Ns` or `Sec` outside its allowed layer.

| Type | Unit | Allowed in | Suffix |
|---|---|---|---|
| `Ticks` (branded safe integer) | **flick**: 1 tick = 1/705,600,000 s | Domain v3 document, operations, history, scene evaluator, audio mix plan | `…Ticks` |
| `HostNs` (decimal string in JSON, `bigint` in code) | ns of the capture host clock | Capture manifest and helper protocol only | `…HostNs` |
| `Micros` (integer) | µs | **Only** at the WebCodecs boundary; never stored | `…Micros` |
| `Seconds` (float) | s | UI display; legacy v2 read once at migration; MCP public API; ffmpeg argv; WebAudio scheduling | `…Sec` |
| Rational timebase `{num, den}` | source track timescale | `MediaSource.probe` | `timebase` |

705,600,000 = 2^9·3^2·5^5·7^2. One tick ≈ 1.417 ns. [S, arithmetic throughout this section; no measurement.]

**Exact (integer ticks per period):**
- Frame durations of 24, 25, 30, 48, 50, 60 fps and 24000/1001, 30000/1001, 60000/1001 (30000/1001 → 23,543,520 ticks per frame).
- Sample periods of 8, 11.025, 16, 22.05, 32, 44.1, 48, 88.2, 96, 176.4 and 192 kHz (44.1 kHz → 16,000 ticks; 48 kHz → 14,700).
- Common media timescales 1/600 (1,176,000), 1/1000 (705,600), 1/90000 (7,840).

**Not exact:** 384 kHz (1,837.5 ticks), the microsecond (1 µs = 705.6 ticks), the nanosecond (1 ns = 0.7056 ticks).

**Registries (validator rules).** `Composition.fps` is accepted only if `ticksPerFrame = 705,600,000 · den / num` is an integer (the nine rates above qualify). Source audio is accepted only at a sample rate that divides 705,600,000; other rates are resampled at import or rejected [P]. Nothing is "approximately on the grid".

**Range.** Safe-integer horizon = 2^53 / 705,600,000 ≈ 1.2765×10^7 s ≈ 147.7 days.

### Arithmetic rules (apply to every conversion below)

- **A1 — `bigint` for any product with a non-tick factor** (ns, sample rate, speed numerator or denominator, timescale, frame index). Results return to `Ticks` only through `checkedTicks(b: bigint): Ticks`, which throws `RangeError` unless `|b| ≤ 2^53 − 1`.
- **A2 — sound fast path.** For safe integers `a`, `b`: if the double product `p = a*b` has `|p| < 2^53`, `p` is exact (IEEE 754 rounding is monotonic, so a true product ≥ 2^53 can never round to a value below 2^53). Otherwise use `bigint`. The fast path is for hot loops (scene evaluator); the cost of `bigint` there is unmeasured [H].
- **A3 — one rounding function.** `divRound(x, d) = floorDiv(2x + d, 2d)` for `d > 0` (round half toward +∞; `floorDiv` is floor division, not `bigint` `/`, which truncates toward zero). Every division in the time module uses it, once per derived quantity, from absolute values, never on accumulated results.
- **Why A1 is not optional:** a 10 h clip is 36,000 s = 2.54×10^13 ticks; multiplied by a speed denominator above ~354 it exceeds 2^53 = 9.007×10^15 (at `den = 1000`: 2.54×10^16).

### Conversion boundaries (all in `src/shared/time/convert.ts`)

| # | Boundary | Formula | Exact or rounded |
|---|---|---|---|
| 1 | `HostNs` → `Ticks` (helper → importer) | `ticks = divRound(ns · 441, 625)` (0.7056 = 441/625); `ns` is always `firstPtsHostNs − anchorHostNs`, both `bigint`, never accumulated | Rounded, ≤ 0.5 tick |
| 2 | Probe pts → `Ticks` | `divRound(pts · tb.num · 705,600,000, tb.den)` | Exact when `tb.den` divides `705,600,000 · tb.num` (timescales 600, 1000, 90000, 44100, 48000 do); else rounded |
| 3 | `Ticks` → `Micros` (WebCodecs) | `divRound(ticks · 5, 3528)` (705.6 = 3528/5); for frame `n`: from `n · ticksPerFrame`, never from a previous µs value | Rounded, ≤ 0.5 µs. At 30000/1001 consecutive frames differ by 33,366 or 33,367 µs (true 33,366.67) |
| 3b | `Micros` → `Ticks` | `divRound(micros · 3528, 5)` | Rounded |
| 4 | `Ticks` → frame | display: `floor(ticks / ticksPerFrame)` (hold); edit snap: `divRound(ticks, ticksPerFrame)`; frame `n` → `n · ticksPerFrame` | Frame → ticks exact; ticks → frame is a rule, not a rounding error |
| 5 | Domain ↔ MCP | see below | Rounded to 1 µs |
| 6 | Domain → ffmpeg | see below | Effective ffmpeg resolution is not claimed beyond what is verified |
| 7 | Domain → WebAudio | `AudioContext.currentTime` seconds only in the preview scheduler; sample offsets from rule 8 | Scheduling only |
| 8 | Domain → audio samples | `sample = divRound(ticks · sampleRate, 705,600,000)`; exact when `705,600,000 / sampleRate` is an integer | Exact for registry rates |
| 9 | v2 → v3 | float seconds → `Ticks` with `divRound`; if rounding makes two same-track clips overlap by one tick, the later clip's start snaps to the earlier clip's end and `migratedFrom: 2` is recorded | Rounded |

**Boundary 3 — WebCodecs.** `VideoFrame.timestamp` and chunk timestamps are integer µs [H on exact API behavior, to be confirmed by G2]. They are **labels**, not a time base: the muxer timebase is the rational fps (`timescale = num`, sample duration `= den`, pts = frame index × `den`), never the µs values.

**Boundary 5 — MCP.** Public times are `…Sec` decimals with exactly 6 fractional digits (1 µs grid: parse `µs = secondsString × 10^6` as `bigint`, then boundary 3b). Lossy by ≤ 353 ticks, and **not on the frame grid at 30000/1001** (frame = 33,366.67 µs). Therefore: (a) every video-track operation snaps to frames by default (`snap: "frame"`); (b) the MCP also accepts integer `…Frame` addressing (frame index at composition fps); (c) audio-track operations may use `snap: "none"` (1 µs grid). Up to 1.2765×10^7 s a 6-decimal value has 14 significant digits ≤ `DBL_DIG` (15), so decimal → double → decimal is lossless [S]; decimal strings are accepted as well.

**Boundary 6 — ffmpeg.** `toFfmpegSeconds(ticks)` formats 6 fractional digits from `divRound(ticks · 5, 3528)`. Revision 3 claimed "9 digits, lossy ≤ 0.5 ns"; withdrawn, because ffmpeg parses most time options to integer microseconds and evaluates filter expressions in doubles [H, verify against the pinned binary in P0a]. Where exactness matters the compiled graph uses **counts at the stream's own rate** instead of seconds: `atrim=start_sample/end_sample`, `adelay` in samples, frame-index `trim`/`select` [H, verify per filter in P7]. Seconds are for coarse seeking only.

**Boundary 8 — audio.** Edit points snap to the sample grid **at render only** (stored ticks unchanged). Retimed audio (speed ≠ 1) produces `divRound(inSamples · den, num)` output samples, rounded once at the clip end. AAC encoder priming (1024 samples on the native `aac` encoder [H]) is a container concern handled in the mux step (see `ARCHITECTURE.md` §4.3), not part of the domain.

### Property tests

(a) Every v2 value with ≤ 6 decimals round-trips `Sec → Ticks → Sec` to the same 6-decimal string; (b) `Ticks → Micros → Ticks` error ≤ **353** ticks (0.5 µs = 352.8 ticks; Revision 3 said 354); (c) every registry frame rate maps frame `n` to exactly `n × ticksPerFrame`; (d) the manifest importer reproduces a synthetic offset to ≤ 1 tick; (e) fast path (A2) equals the `bigint` reference on 10^6 random operand pairs including values near 2^53; (f) a 10 h clip with `den = 1000` equals the `bigint` reference and `checkedTicks` rejects values above 2^53 − 1; (g) every registry sample rate maps `n` samples to exactly `n × ticksPerSample` and back.

---

## 3. Project layout on disk

```
<project>/
  project.json            v2: references capture sessions (no fixed media/*.webm keys); carries NO timing offsets
  editor.json             EditorDocument (v2 until P3.10, then v3); editor.v2.backup.json kept on first v3 write
  media/<sessionId>/      capture files + capture-session.json (helper-owned until finalized)
  media/imports/          user-imported media (UUID-gated, containment-checked)
  .ovc/                   lock, history, analysis, proposals (app-written only), proxies, peaks, thumbs
```

`edits.json` and `subtitles.json` stop being written and are tolerated on read. All writes stay atomic with revision compare-and-swap and the existing lock file [V].

---

## 4. Domain entities (editor document v3)

```ts
type Ticks = number & { __brand: "Ticks" };          // safe integer
type Id = string;                                     // uuid

interface EditorDocumentV3 {
  schemaVersion: 3; revision: number; savedAt: string;
  composition: Composition;
  captureSessions: CaptureSession[];                  // section 6.3: pauses, engine, anchor
  sources: MediaSource[];
  tracks: Track[];
  clips: Clip[];
  transitions: Transition[];
  templates: TemplateDef[];
  subtitleStyles: SubtitleStyle[];
  lastTransaction?: Transaction;
  migratedFrom?: 1 | 2;
  extensions?: Record<string, unknown>;               // unknown fields preserved (forward compat)
}
```

### 4.1 MediaSource (independent source files)

```ts
interface MediaSource {
  id: Id;
  kind: "screen" | "camera" | "mic" | "systemAudio" | "import" | "generated";
  file: string;                       // project-relative; contained
  probe: { durationTicks: Ticks; timebase: {num:number; den:number};
           fps?: {num:number; den:number}; vfr: boolean;
           width?: number; height?: number; codec: string; colorSpace?: string;
           sampleRate?: number; channels?: number };
  captureSessionId?: Id;              // references CaptureSession.id
  trackId?: string;                   // helper trackId inside the session
  segmentIndex?: number;              // file ordinal when a logical track rolled over to a new file
  timeMap: TimeMap;                   // section 6.3: source time -> capture time. Identity for imports and v2
  proxies?: { video720?: string; peaks?: string; thumbs?: string };
}
```

**One file = one `MediaSource`.** A display, a camera, a microphone and the system audio are each their own source, and sources never share a file. When a logical track rolls over to a new file (device restart, hot-plug), each file becomes its own `MediaSource` sharing `captureSessionId` and `trackId`, ordered by `segmentIndex`, each with its own `timeMap`. `TimeMap` segments (section 6.3) describe timestamp jumps *inside* one file.

### 4.2 Track, Clip, Transition, Effect

```ts
interface Track {                     // replaces track + lane integers
  id: Id; kind: "video" | "audio" | "overlay" | "subtitle";
  name: string; order: number;
  muted: boolean; solo: boolean; locked: boolean;
  gainDb?: number; pan?: number; effects: Effect[];
}

interface Clip {
  id: Id; trackId: Id; sourceId?: Id;
  timelineStartTicks: Ticks;                          // timeline axis t
  sourceInTicks: Ticks; sourceOutTicks: Ticks;       // source axis s (file presentation time); out exclusive; sourceEnd was missing in v2
  speed: { num: number; den: number };               // speed = num/den, section 4.2a (zero and negative are invalid)
  transform?: Transform2D; keyframes?: Keyframe[];
  effects: Effect[];
  gainDb?: number; fadeInTicks?: Ticks; fadeOutTicks?: Ticks;
  linkGroupId?: Id;                                   // linked audio/video edits (exists in v2 behavior)
  templateInstance?: { templateId: Id; version: number; slots: Record<string, unknown> };
}

interface Transition {                // between two adjacent clips of one video track (a "cut")
  id: Id; trackId: Id; fromClipId: Id; toClipId: Id;
  ref: RegistryRef<"transition">;     // e.g. { id: "ovc.crossfade", version: 1 }; closed set, no free strings
  durationTicks: Ticks;               // timeline time
  params: unknown;                    // validated by the registry entry's schema
}

interface Effect { id: Id; ref: RegistryRef<"effect">; params: unknown; enabled: boolean; }

type RegistryRef<K extends "effect" | "transition"> = { id: string; version: number };   // id is a closed union generated from the registry of kind K

interface RegistryEntry<K> {          // one registry module serves effects and transitions
  kind: K; id: string; version: number;
  paramsSchema: unknown;              // Zod schema; defaults and bounds live here
  shaderId?: string;                  // compositor program (Stage 2); legacy ffmpeg mapping optional
  audio?: "equal-power-crossfade" | "none";          // transitions only: companion audio behavior
}
```

**Registry rules.** Entries are `{kind, id, version}` and immutable once released; a behavior change is a new `version` and the document stores the version it was authored with. A `ref` that is not in the registry is a **validation error on write** (operations, MCP, import) and is **preserved and flagged `unsupported` on read** (forward compatibility, `extensions`), never silently rendered as something else. Zoom stops being a global range list and becomes a composition-level effect track with keyframes (migrated from `zoomEffects`).

**v2 → v3 transition map (1:1, no new behavior):** `crossfade → ovc.crossfade@1`, `fade-black → ovc.fade-black@1`, `slide-left → ovc.slide-left@1`, `wipe-left → ovc.wipe-left@1`, all with empty params [V: the four values of `ClipTransitionType`, `types.ts:35`].

### 4.2a Clip timing (normative)

Let `speed = n/m` (`num = n`, `den = m`). Three axes are involved: source `s`, timeline `t`, and (only at import, section 6.3) capture `c`.

- **Speed validity.** `n`, `m` integers ≥ 1, `gcd(n, m) = 1`, and `1/4 ≤ n/m ≤ 8` [P; bounds to be validated against audio-retime quality in P7]. Zero and negative values are rejected (`INVALID_SPEED`). A freeze frame is a separate effect and reverse playback a future boolean; neither is "speed ≤ 0". v2 `SpeedRate ∈ {1..5}` [V `types.ts:31`] migrates to `{num: k, den: 1}`.
- **Source bounds.** `probe.startTicks ≤ sourceInTicks < sourceOutTicks ≤ probe.startTicks + probe.durationTicks`, checked on the file axis and independent of speed. `generated` sources have no upper bound. v2 clips with `pendingDuration` [V `types.ts:49`] are provisional until the probe exists, then the bound is enforced.
- **Timeline duration.** `D_t = divRound((out − in) · m, n)` in `bigint`, derived and never stored; `timelineEnd = timelineStart + D_t`. Source time at timeline `t`: `s(t) = in + divRound((t − start) · n, m)`, clamped to `[in, out − 1]`. The two maps invert each other only to ±1 tick; evaluation always runs `t → s`.
- **Overlap.** On one track clips are half-open `[start, end)`, must not overlap, gaps are allowed. Clips on different tracks overlap freely (visual order by `Track.order`, audio summed). Operations remain all-or-nothing [V `operations.ts`]. Migration keeps the one-tick snap rule (boundary 9).
- **Frame snapping vs sub-frame editing.** The document may hold any tick. (1) Operations carry `snap: "frame" | "none"`; default `frame` for video and overlay tracks (clip start, end, in/out, transition duration, keyframe times: `divRound(t, ticksPerFrame) · ticksPerFrame`), default `none` for audio tracks. (2) The validator **warns, does not reject**, on unsnapped video boundaries. (3) At render, a clip is visible in frame `n` iff `start ≤ n · ticksPerFrame < end`, so a sub-frame boundary takes effect on the next frame. (4) Audio edit points snap to samples only at render (boundary 8). (5) Changing `composition.fps` never re-snaps automatically; that is an explicit operation.

### 4.2b Transitions (normative)

- **Semantics: centered on the cut, timeline duration unchanged.** Clips stay butt-joined: `to.timelineStart == from.timelineEnd` (exact; migration snaps v2's 0.05 s detection tolerance [V `transition-utils.ts:33`]). The window is `[w0, w0 + d)` with `w0 = cut − ⌊d/2⌋`, progress `p(t) = (t − w0) / d` evaluated as a ratio of integers at the frame time. This preserves v2 behavior [V `transition-utils.ts:81-82`], so migration is lossless.
- **Handles.** When the outgoing clip has no media after its out (or the incoming none before its in), the edge frame is **held**, as v2 does [V `PreviewTransitionLayer.tsx:36` clamps the offset to the clip]. "Use real handle media when available" is a possible later registry version, not v3.0.
- **Duration limits.** Registry defaults `0.1 s ≤ d ≤ 2 s` [V: v2 values, `transition-utils.ts:43-51`], `d` a whole number of frames, and the half-windows of the two transitions touching one clip must not overlap: `d_left/2 + d_right/2 ≤ D_t(clip)`.
- **Audio companion:** the entry's `audio` field selects an equal-power crossfade over the same window or none; the mix plan (`AudioMixPlan`) compiles it. The current export applies half-duration fades instead [V `ffmpeg.ts:361`]; that gap is closed in P7, not here.

### 4.3 Composition, layout, overlays, keyframes, subtitles

```ts
interface Composition {
  width: number; height: number;
  fps: { num: number; den: number };                  // output fps, never silently 30
  background: BackgroundSpec;
  workingColorSpace: "sdr-bt709-srgb";
}
```

- **Layouts** are keyframable layer transforms: a layout preset is a template that writes transforms. Corner style, border, shadow and mask live on the layer (`cornerRadiusPx`, `border`, `shadow`, `mask`).
- **Overlays** (text, image, shape, card, lower-third) are clips on `overlay` tracks, optionally `templateInstance`.
- **Keyframes:** `{tTicks, value, easing: cubicBezier | step | linear}`; reuses the `zoom-utils` bezier.
- **Subtitles:** a `subtitle` track with cues `{startTicks, endTicks, text, words[], styleRef}` and style presets (plain, karaoke, boxed, pop).
- **Template:** `{id, version, kind, paramsSchema, layers}`; stored in the project, optional user library in `userData/templates/`.

### 4.4 Audio data feeding `AudioMixPlan`

Per clip: `gainDb`, fades, `speed`. Per track: `gainDb`, `pan`, mute/solo, effects (gate, compressor, EQ, limiter). Master: limiter and optional loudness target. These compile to one pure `AudioMixPlan` that the preview interprets with WebAudio and export compiles to a streaming ffmpeg graph. No audio math exists outside that plan.

### 4.5 Operations, transactions, history

- Domain **operations remain the only mutation path** for UI, MCP, Gemini and importers. The Zod schema is checked against the TS types by a drift test.
- `Transaction{id, actor: "user"|"agent:<name>", proposalId?, summary, ops[], baseRevision}`; each commit is one undo entry.
- History: document-level transactions for all state (fixes undo covering only `timelineSegments`, 50 entries today [V: `stack.slice(-49)` plus the new entry, `useTimelineEditing.ts:272`; Revision 3 said 49 here and 50 in `ADR.md`]). Recommended **Immer patches** (inverse patches = undo, forward patches = AI diff summary + audit log), capped by count and size [P: 200 entries / 32 MB]; adopt or reject after a measured document-size check in P3.1.

### 4.6 Migration registry

Chain v1→v2→v3 of pure, fixture-tested functions. First v3 write keeps `editor.v2.backup.json`. Readers reject a *newer major* with a typed error and preserve unknown fields in `extensions`. v2 projects stay untouched until their first save.

---

## 5. Recording data: the capture session

`capture-session.json`, owned by the helper, rewritten atomically on every state change and every 5 s:

```jsonc
{
  "manifestVersion": 1,
  "sessionId": "…",
  "engine": "native",                                          // "native" | "chromium" (main writes the same manifest for the Chromium engine)
  "clockDomain": "host",                                       // "host" | "chromium-monotonic": the latter supports differences only
  "hostClock": { "timebaseNumer": 125, "timebaseDenom": 3 },   // example shape only; absent for the Chromium engine
  "anchorHostNs": "123456789000",
  "pauses": [ { "startHostNs": "…", "endHostNs": "…" } ],
  "tracks": [{
    "trackId": "disp-1", "kind": "display|camera|mic|systemAudio",
    "deviceId": "…", "file": "disp-1.mov", "codec": "hevc",
    "width": 2560, "height": 1600, "fps": null,                // null = variable frame rate
    "sampleRate": null, "channels": null,
    "firstPtsHostNs": "…", "lastPtsHostNs": "…",
    "framesWritten": 0, "framesDropped": 0,
    "segments": [ { "file": "…", "firstPtsHostNs": "…" } ],     // present when a track rolled over
    "status": "recording|finalized|interrupted|failed"
  }],
  "status": "recording|finalized|interrupted",
  "endedAtHostNs": "…"
}
```

`…HostNs` values are decimal strings (they exceed 2^53). The importer converts them to `Ticks` at boundary 1. **Every capture path produces this manifest**: the native helper writes it; for the Chromium engine (the C6 hybrid fallback) main writes it from per-track `performance.now()` at each recorder's `onstart` and first chunk (`engine: "chromium"`, differences only). There is no separate per-track offset field in `project.json`. Importers (native, Chromium, recovery) read the manifest and emit `CaptureSession` + `MediaSource.timeMap` (section 6.3); that is the single synchronization representation.

---

## 6. Synchronization

The problem is multi-device: a USB webcam, a USB microphone, an SCK display stream and an SCK audio stream each run on their own clock and with their own hidden latency. **A single timestamp or a simple start offset does not solve this.**

### 6.1 Sources of error

| Error | Behavior | Handling |
|---|---|---|
| Start offset | Tracks start at different host times | `firstPtsHostNs − anchorHostNs` per track → `captureStartTicks` of the first `TimeMap` segment |
| Device latency | USB webcam/mic timestamps hide tens of ms [H] | Per-device calibrated offset `K` (`calibrationOffsetTicks`; clap/flash measurement), editable in the editor |
| Clock drift | Audio device clocks drift from host time [H] | Measured over 60 min in G1-CAPTURE; resample at write time **or** `rateppm` in the `TimeMap` (validator requires 0 until measured) |
| Pause/resume | Retimed buffers risk clicks, non-increasing timestamps [H, T9] | Record continuously, ranges owned by the manifest and imported into `CaptureSession.pauses`; or new segment per resume (a gap on the `c` axis) |
| VFR | SCK sends frames on change | Hold semantics (latest frame with PTS <= t); never assume CFR |
| Sleep/wake | `mach_absolute_time` stops during sleep (`mach_continuous_time` does not) [H, verify] | Auto-pause on sleep, re-anchor on wake, verify continuity; never mix host time with wall clock |
| Device restart / rollover | New file for the same logical track | `segments[]` in the manifest; each file becomes its own `MediaSource` (`segmentIndex`); in-file timestamp jumps become `TimeMap` segments |
| Container edit lists, negative start times | Wrong offsets if ignored | Probe real `start_time` per file after remux (ffprobe) |

### 6.2 Rules

1. Capture on **one host clock**. Convert SCK buffers from `SCStream.synchronizationClock` and AVCapture buffers from `session.synchronizationClock` with `CMSyncConvertTime`; do not assume they equal host time [H].
2. The anchor is the earliest `track.started`.
3. Offsets always come from absolute values, never accumulated.
4. The importer places each source's clips from its `TimeMap` (default `timelineStartTicks = c(sourceInTicks)`); the old `sourceStart: 0` placement disappears.
5. A cross-check is available but optional: cross-correlate the webcam microphone against the main microphone to detect residual offset.

### 6.3 `TimeMap` and `CaptureSession` (normative)

**Three axes, never mixed.**
- **`s` — source time.** Presentation timestamp inside the media file, in `Ticks`, **after** container edit lists are applied, keeping the file's real start time (it is not forced to 0; `probe.startTicks` records it) [H: edit-list semantics are verified by G2-RENDER R3 and the probe step].
- **`c` — capture time.** Anchor-relative host-clock time in `Ticks` (`HostNs − anchorHostNs`, boundary 1). Continuous: it keeps advancing during pauses. All sources of one `CaptureSession` share it; it is the synchronization axis.
- **`t` — timeline time.** Related to `s` only through a clip (section 4.2a). `c` is used at import to place clips (default `t = c`) and nowhere else.

```ts
interface TimeMap {                    // per MediaSource (one file)
  segments: TimeMapSegment[];          // ≥ 1, sorted by sourceStartTicks
  calibrationOffsetTicks: Ticks;       // K: source-wide, signed, user-editable
}
interface TimeMapSegment {
  sourceStartTicks: Ticks;             // S_i  on axis s
  sourceDurationTicks: Ticks;          // D_i  > 0, measured on the SOURCE axis
  captureStartTicks: Ticks;            // C_i  on axis c, before calibration
  rateppm: number;                     // r_i  integer, signed; see below
}
interface CaptureSession {             // document level, one per recording; owns shared session facts
  id: Id; engine: "native" | "chromium";
  pauses: Array<{ startTicks: Ticks; endTicks: Ticks }>;   // on axis c, half-open [start, end)
  endedAtTicks?: Ticks;
}
```

**Mapping (source → capture).** For `S_i ≤ s < S_i + D_i`:

`c(s) = C_i + divRound((s − S_i) · (1,000,000 + r_i), 1,000,000) + K`   (`bigint`, rules A1–A3)

- **`rateppm` sign.** `r = (Δc / Δs − 1) · 10^6`. Positive: capture time advances faster than source time, i.e. the source's own clock runs **slow** against the host clock. Example: `r = +20` over 3,600 s of host time leaves the source with 3,599.928 s of media [S].
- **Units and limits.** Integer ppm; `|r| ≤ 10,000` [P] (beyond that it is an error, not drift). Resolution 1 ppm = 3.6 ms per hour [S], against the proposed 20 ms per 60 min budget [P]; if G1-CAPTURE shows finer resolution is needed, move to parts per billion **before** the field ships (nothing is implemented, so no migration cost).
- **Unmeasured, therefore not built.** Until G1-CAPTURE measures drift on the target machine the validator requires `r_i = 0`. The field and formula are specified; drift handling is not implemented. When enabled, clips of a drifting source compute timeline duration over the capture axis (`c(out) − c(in)`) instead of `out − in`; the choice between that and resampling at write time is decided by the measurement (open question 3).
- **`durationTicks` axis.** `D_i` is on the **source** axis (renamed `sourceDurationTicks`); its capture-axis length is `c(S_i + D_i) − c(S_i)`.
- **Order of corrections.** Segment/drift term first, calibration `K` last. `K` is a pure shift on `c`, so it never changes a clip duration; editing `K` shifts placement only (operation `set_source_calibration{sourceId, offsetTicks}` moves every clip of that source by the delta in one transaction) [P].
- **Segment invariants.** Sorted by `S_i`; `S_i + D_i ≤ S_{i+1}` (no overlap on `s`); `c`-end of segment `i` (before `K`) `≤ C_{i+1}` (no overlap on `c`). A positive gap on either axis means **no data** (timestamp jump, device loss, a method-B pause). An overlap greater than 1 tick is invalid: the importer marks the source `TIMEMAP_OVERLAP` and does not repair it silently (recovery re-derives from the manifest). Segments are half-open, so a boundary sample belongs to segment `i + 1`.
- **Outside every segment** `c(s)` is undefined. The inverse `s(c)` exists only where `c − K` lies in the image of a segment; inside a gap video holds its last frame (hold semantics) and audio is silent.
- **Identity.** Imported files (`kind: import`) and migrated v2 sources get one segment `{S_0 = probe.startTicks, D_0 = probe.durationTicks, C_0 = S_0, r = 0}` and `K = 0`.

**Pauses: one owner, one coordinate system.** The authoritative record is the capture manifest (`pauses[]`, `HostNs`, helper-written). The importer converts it **once** into `CaptureSession.pauses` on axis `c`; there is no per-source copy and `TimeMap` has no `pauses` field. How a pause shows up depends on the pause method (open question 2): **method A** (record continuously) keeps the paused material in the files, so pauses are edit-decision data (the initial timeline is built with those `c` ranges omitted); **method B** (new segment or file per resume) leaves a gap on `c`, which the segment invariants above already express.

**Property tests.** Synthetic offset, calibration, jump and (once enabled) drift inputs reproduce within 1 tick; `c(s)` is strictly increasing within a segment for `|r| ≤ 10,000`; importer output from a native manifest and from a Chromium manifest of the same synthetic scenario yields identical `timeMap` up to the Chromium clock's declared resolution; a manifest with an overlapping rollover yields `TIMEMAP_OVERLAP`.

---

## 7. Recovery metadata

- `project.json` project/session `status`: `recording | processing | ready | recovered | failed`. A project that is `recording` or `processing` at launch triggers the recovery service (repair or remux, probe, import with offsets, mark `recovered`, show a notice).
- Session manifest `status: interrupted` plus the per-track `lastPtsHostNs` give the recovered duration; the acceptance rule is recovered duration >= wall time − 2 s [P].
- The importer never overwrites a recovered file; it writes a new `MediaSource` entry and keeps the original under `media/<sessionId>/`.
- Export recovery: exports write to `.part` and rename on success; leftover `.part` files are cleaned at launch.

---

## 8. Open questions (do not decide here)

1. Crash-safe container: fragmented `.mov` vs CMAF segments vs segmented files; LPCM in CAF vs inside `.mov` (G1-CAPTURE T7).
2. Pause method: continuous recording with ranges vs segment per resume (T9). Decides whether pauses are edit-decision data or segment gaps (section 6.3).
3. Drift: is it non-zero at all, is resampling at write time needed, or is `rateppm` in the `TimeMap` enough, and is integer ppm (3.6 ms/h) fine enough? (60-min drift run in G1-CAPTURE.)
4. Whether SCK and AVCapture timestamps convert cleanly to the host clock on the target Mac.
5. Whether Immer patches fit the size budget on a 60-minute project (P3.1).
6. Whether ffmpeg time options are microsecond-resolution in the pinned build and which filters accept sample/frame counts (P0a probe, P7) — section 2, boundary 6.
7. Speed range `[1/4, 8]` and the transition duration bounds are inherited or proposed [P]; audio-retime quality may narrow them (P7).
