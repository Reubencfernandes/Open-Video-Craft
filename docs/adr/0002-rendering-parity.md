# ADR-0002: Shared scene evaluator and a single GPU compositor for preview and export

- **Status:** Proposed. Conditional on the R-PoC spike (tests R1–R12).
- **Date:** 2026-11-15
- **Deciders:** Project owner
- **Plan reference:** [0000](0000-architecture-roadmap.md) §2i, ADR-4, phase P5

## Context

Preview is a DOM/CSS compositor; export is a hand-written ffmpeg filter graph. They share no rendering code, only constants copied by hand. Export omits camera, layouts, background, corner styling and styled subtitles, and its zoom math differs from the preview's.

## Decision

- A pure TypeScript **scene evaluator** (`evaluateScene(doc, tTicks, ctx) → RenderScene`) holds all timing semantics (speed, transitions, zoom chains, keyframes). Preview and export call the same function.
- One **WebGL2 compositor** renders both. Frame sources are `HTMLVideoElement` (interactive preview) or WebCodecs `VideoFrame` (frame-exact scrub and export). Text, cards and subtitles are rasterized once into textures by the same code.
- Export runs in a dedicated worker or hidden window: WebCodecs decode, composite, WebCodecs encode, mux. Audio comes from the shared `AudioMixPlan` (ADR-0006) through ffmpeg.
- GPU: YUV→RGB, scale, crop, zoom, compositing, masks, borders, shadows, transitions. CPU: scene evaluation, layout, text shaping, audio mix, mux, analysis.

## Conditions

- Pass/fail thresholds, scenes S1–S3 and the definition of "1.0× realtime" (output duration ÷ wall-clock from request to verified file) are normative in plan §2i.
- **Hard kill → AVFoundation + Metal/Core Image compositor inside the helper:** non-deterministic seeking or stepping; hardware encode not confirmed by more than `isConfigSupported`; 1080p30 below 1.0×; unbounded or over-budget memory; an unfixable demuxer.
- **Downgrades, not kills:** 1080p60 (limit export to 30 fps), the WebCodecs preview player (fall back to `<video>` with shared shaders), color mismatch (fix in shader).
- Working color space: SDR BT.709 / sRGB display-referred, to be confirmed by R4.

## Consequences

- One implementation of rendering semantics; parity becomes testable by golden frames.
- Cost: a frame-accurate preview player is a real deliverable, and WebCodecs behavior with VFR and edit lists must be proven on helper output.
