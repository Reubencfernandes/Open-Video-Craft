# Callout export fidelity
Objective: make exported callout boxes match the editor preview: text inside the box, readable line breaks, title casing and background translucency. Branch `feat/p0b-min-fork-identity`; no PR or merge. Test runner: Vitest, Node 22.

## Specs

- S1 User request (verbatim): "I box con i testi si vedono bene in preview, ma poi si vedono malissimo, con il testo che esce fuori, senza semitrasparenza, il testo tutto attaccato... quanso esporto il video. Fixalo".
- S2 Callout box dimensions must be computed from measured title/body text and font metrics, not a fixed width multiplier.
- S3 Title and body must be wrapped and positioned inside the panel with correct line spacing.
- S4 A borderless callout must render one translucent panel, not two stacked panels whose alpha compounds to opaque.
- S5 Behavior changes ship with Vitest tests through public interfaces; full verification and an ad-hoc rebuild must pass.

## Tasks

- [x] T1 (S1-S3) Compute callout layout from font metrics and apply it to box and drawtext. Route: inline.
- [x] T2 (S1, S4) Draw a single panel when border width is zero. Route: inline.
- [x] T3 (S1-S5) Verify, commit and rebuild/relaunch the app. Route: inline. Final rebuild and relaunch verified.

## Log

- L1 (user, verbatim): "I box con i testi si vedono bene in preview, ma poi si vedono malissimo, con il testo che esce fuori, senza semitrasparenza, il testo tutto attaccato... quanso esporto il video. Fixalo".

- L2 (evidence): extracted export frame at the first callout showed a 328 px opaque box with title/body overflow. With metric-based layout the 720p box is 708x110, title is uppercased, body line spacing is explicit, and borderless panels use one RGBA source with alpha 216/255 instead of two stacked 0.85-alpha layers.

- L3 (evidence): 536 Vitest tests passed, typecheck, build, MCP smoke and diff-check OK. Final app rebuilt and relaunched as PID `85109`, frontmost with window `Open Video Craft`.
