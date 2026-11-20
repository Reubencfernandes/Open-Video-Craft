# P0b-hygiene — dependency/security cleanup and CI hardening

Objective: complete the non-blocking P0b-hygiene slice after P0c, without starting hardware gates or public distribution.
Branch: `feat/p0b-min-fork-identity`; delivery: work-unit commits only, no push or merge without the owner.

## Specs

- S1 User request (verbatim): "Abbiamo finalmente spazio sul disco primario, continua le lavorazioni fino al totale completamento dell'app".
- S2 From `IMPLEMENTATION_PLAN.md` §P0b-hygiene: "zod and MCP SDK bumps; remove ACE-Step (`acestep_generate.py`, `music-generation.ts`, `tests/music-generation.test.ts`); drop the Windows matrix; CI: SHA-pinned actions, `npm audit`, scoped permissions, dependabot; decide `@vitest/coverage-v8`; commit ADRs."
- S3 From `IMPLEMENTATION_PLAN.md` §P0b-hygiene: "**Acceptance:** `npm audit` shows no high/critical in runtime dependencies (**reported 39 advisories, 3 critical / 28 high / 8 moderate, mostly dev tooling; re-measured after the bump**); CI green on macOS."
- S4 From `IMPLEMENTATION_PLAN.md` §P0b-hygiene: "Not on the critical path of either gate."
- S5 From `AGENTS.md`: "Changes to update feeds, signing, identity or dependencies are called out in the commit message."

## Tasks

- [x] T1 (S1, S2, S3, S5) Bump zod and MCP SDK to the latest compatible versions, refresh the lockfile, and record `npm audit` runtime results. Route: inline fallback. Commit: `3fe5206`. Evidence: MCP SDK 1.32.2, zod 4.6.7, Transformers.js 4.3.2, sharp 0.35.5, fast-uri 3.1.9; runtime audit 0 high/0 critical, 2 moderate; full audit 17 high/2 critical in dev tooling; 84 test files/402 tests, typecheck, build, MCP smoke passed; ORT WASM asset present.
- [x] T2 (S1, S2, S4) Remove ACE-Step and all dead music-generation integration points, tests and bundled resources while preserving Lyria behavior. Route: inline fallback. Commit: `2066d49`. Evidence: 2 RED tests observed, GREEN focused 15/15, full suite/typecheck/build/MCP smoke exit 0, differential of unchanged validators and operation schema identical to `3fe5206`, no residual ACE-Step references in changed surfaces.
- [x] T3 (S1, S2, S3, S4) Drop the Windows CI matrix, SHA-pin actions, add `npm audit` and scoped permissions, add dependabot, decide coverage tooling, and record ADRs. Route: inline fallback. Commit: `3036043`. Evidence: 6 RED workflow tests observed, 6/6 GREEN; full suite/typecheck/build/MCP smoke/runtime audit/YAML load/diff-check exit 0; full audit retains 17 high/2 critical dev-tooling advisories; no mutable action refs or active Windows references; ADR-14 records decisions.
- [x] T4 (S2, S3, S4, S5) Parent verification: focused differential checks, full tests, typecheck, build, MCP smoke, audit, independent verifier if required, and reviewable work-unit commits. Route: inline. Commit: pending. Evidence: parent checks and `gga` pre-commit reviews passed for T1-T3; the independent verifier required by RDD item 3 was unavailable because three subagent attempts timed out awaiting a child bash permission; native review is blocked by provider selection binding mismatch.

## Log

- L1 (2026-11-19, user, verbatim): "Abbiamo finalmente spazio sul disco primario, continua le lavorazioni fino al totale completamento dell'app".
- L2 Later user messages (verbatim): "come procede? Ho finito i crediti per caso?", "sai quando si ricaricano e posso continuare?", "continua", "continua".
- L3 P0c completed first; this slice starts only after its baseline evidence is frozen.
- L4 No hardware gate, Apple Developer credential, threshold ratification or public distribution work is authorized by this document.
- L5 Delegated writer `mwo5pj2a-3-b3hm` timed out after 30 minutes awaiting a child bash permission; 0 turns and no modifications were produced. Parent switched to inline implementation and preserved the independent verification task.
- L6 The first non-breaking audit fix reduced runtime advisories from 1 critical/8 high to 0 critical/4 high. Overrides and Transformers.js v4 reduced high/critical runtime advisories to zero; Vite ORT runtime asset resolution was updated to the onnxruntime-web path and verified by build.
- L7 T1 committed as `3fe5206` with `gga` review passed.
- L8 T2 committed as `2066d49` with `gga` review passed. Local ACE-Step module, Python helper, setup IPC, request fields and legacy test name were removed; Lyria behavior was preserved, and the legacy test file was replaced by `tests/music-lyria.test.ts`.
- L9 T3 committed as `3036043` with `gga` review passed. macOS-only CI/release, SHA-pinned actions, least-privilege permissions, runtime audit, Dependabot and ADR-14 landed; Windows scripts/tests/configuration were retired.
- L10 Independent verifier `mwo7nuyd-4-jm8b` and fallback `mwo8rbfh-5-0ia7` timed out after 30 minutes each awaiting child bash permission; 0 turns and no findings. Parent did not retry further and recorded the verifier as unavailable.
- L11 Native RDD review lineage `review-62fdfcc1453013d1` reached `selection-required`. The provider rejected the intended-untracked bindings as stale (`binding-mismatch`) and requires a current host-issued binding or explicit owner decision; no approval was burned. Blocker category: input, actor: caller, automatic retry: false.
- L12 Forecast from native review (informational): four reviewer model runs for risk/resilience/readability/reliability and one refuter model run were forecast; no additional run was authorized after the selection blocker. Reviewer runs previously completed in the lineage produced an escalation with unknown causality (`R3-002`) and one corroborated refutation (`R3-001`, proof: probe unavailable on pi; `release.yml:176`; `package.json`).
- L13 Final task log committed as `75a6600` with `gga` review passed.
- L14 Owner decisions (2026-11-19): resume native review with a valid binding; ratify every `[P]` threshold for `G0-THRESHOLDS`; no Apple Developer account or Developer ID/notarization credentials, so local/ad-hoc signing only; authorize push of `feat/p0b-min-fork-identity` to the fork remote without merge or PR.
- L15 ADR-15 records the owner decisions. The provider again rejected the refreshed intended-untracked binding as stale and forbade automatic retry, so native review remains blocked and no approval was burned.
- L16 After splitting T3 into four smaller commits, native review lineage `review-e7a401e9f8f77a0d` completed four reviewer lenses and one refuter, then required correction for R3-001 (Intel x64/universal macOS targets removed). A documentation-only correction was rejected by the targeted validator. The owner then explicitly chose to restore Intel/universal targets, so `package.json`, `release.yml`, README, ADR-15, CHANGELOG and workflow tests now preserve x64+arm64 and `dist:mac:universal`.
