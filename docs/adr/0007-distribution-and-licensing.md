# ADR-0007: Distribution, fork identity and licensing

- **Status:** Proposed. Licensing questions need specialist review; no legal conclusion is recorded here.
- **Date:** 2026-11-15
- **Deciders:** Project owner
- **Plan reference:** [0000](0000-architecture-roadmap.md) §7, ADR-8, phases P0b and P11

## Context

The repository carries upstream's `appId`, update feed and Team ID, so an unretargeted fork would auto-update from upstream. The bundled FFmpeg is GPLv3 (x264/x265); upstream states Mac App Store compatibility is unresolved. The locked Electron 43.0.0 has known advisories.

## Decision

- **First channel: signed and notarized DMG, arm64 only.** Developer ID, hardened runtime.
- Retarget `appId`, `productName`, `publish` and Team ID to the fork before any release build; auto-update stays off until the fork's own feed exists.
- Bump Electron, zod and the MCP SDK; add `npm audit`, SHA-pinned actions, scoped release permissions and a generated license report.
- Extend release verification to cover the app, the capture helper and ffmpeg.
- Keep the GPL ffmpeg for the DMG with the fork's own source offer; evaluate an LGPL build (VideoToolbox only) once ffmpeg's role shrinks to probe, mux, audio and proxies.
- A Mac App Store build is out of scope; the MAS configuration is no longer maintained and is deleted only after an explicit decision.

## Legal questions for specialist review

1. GPLv3 obligations for a separate GPL executable inside an app with another license.
2. H.264/HEVC patent exposure: bundled x264/x265 versus system VideoToolbox encoders.
3. Whisper model and weights licenses and redistribution.
4. Licenses of bundled overlay fonts used in exports.
5. Consent, retention and deletion for uploading recordings to Gemini or cloud speech-to-text.
6. Fork naming and trademark relative to upstream.

## Consequences

A clear identity and update channel; Store distribution remains a later, separate decision.
