# ADR-0006: One `AudioMixPlan` for preview, export and analysis

- **Status:** Proposed. Verified by numeric parity tests in phase P7.
- **Date:** 2026-11-15
- **Deciders:** Project owner
- **Plan reference:** [0000](0000-architecture-roadmap.md) ADR-6, phase P7

## Context

Audio mixing is implemented three times (WebAudio preview, renderer decode for transcription, ffmpeg `amix` for export). Export has no limiter and volumes reach 4×, so export can clip where the preview looks fine. Transition audio is a plain fade.

## Decision

A pure TypeScript `AudioMixPlan`, derived from the document, is the only description of the mix. Preview interprets it with WebAudio nodes. Export compiles it to a streaming ffmpeg graph (`atrim`, `adelay`, `volume`, `acrossfade`, `amix normalize=0`, `alimiter`, optional two-pass `loudnorm`). Analysis and transcription read PCM through the same plan. Processing (gate, compressor, EQ, limiter) is per track and on the master, off by default.

## Conditions

Parity is numeric: RMS, peak and LUFS between a WebAudio offline render of short windows and the ffmpeg output within ±0.5 dB and ±1 LU [P]; no export clipping above −1 dBTP with the limiter on.

## Consequences

One mix definition and an honest meter. Cost: a plan compiler for two back-ends.
