# IMPLEMENTATION PLAN — Open Video Craft macOS fork (Revision 4)

- **Baseline:** `main` @ `143a0d6` (v1.0.6, unreleased). Planning only; nothing installed, built, tested or benchmarked.
- **Companion:** `ARCHITECTURE.md`, `DATA_MODEL.md`, `ADR.md`. Long-form detail and thresholds: `docs/adr/0000` unless this revision states otherwise.
- **Tags:** **[V]** verified in code · **[S]** static/arithmetic · **[H]** hypothesis · **[P]** proposed target (not a measured capability).
- The pass/fail state of the current ~367 tests (78 files) is **unknown**.
- **Revision 4 principle:** prove the two capabilities that can sink the project (multi-source recording with sync and recovery; deterministic preview/export rendering with audio) **before** building anything that depends on them. No roadmap item promises a capability whose gate has not passed.

---

## 1. Priorities, challenged

The brief proposes P0 (blockers), P1 (reliability/performance), P2 (advanced). Revision 4 keeps the classification but orders work by gate.

| Item | Brief | Revision 4 | Why |
|---|---|---|---|
| Fork identity / update isolation | P0 | **P0b-min, first** | A packaged build checks upstream's feed 5 s after launch and every 4 h [V `auto-updates.ts`]; nothing packaged may run before this is fixed. |
| Electron bump | P0 | **P0b-min** (blocks `G2-RENDER`) | The render gate must run on the Electron/Chromium intended for the product. |
| Other dependency/security hygiene (audit, CI pinning, ACE-Step removal, Windows matrix) | P0 | **P0b-hygiene**, non-blocking, after the original baseline | Hardening before measuring destroys the "before" numbers; none of it gates a capability. |
| Native capture architecture | P0 | **`G1-CAPTURE` only**, then P2/P4 on GO | A rewrite before the proof of concept is unjustified. |
| Multi-source sync | P0 | **Specified** in `DATA_MODEL.md` §6.3 (`TimeMap` + `CaptureSession`); implemented after `G1-CAPTURE` | The data contract is documentation now; code waits for measured drift/pause behavior. No interim offset field. |
| Preview/export parity | P0 | **`G2-RENDER` only**, then P5b on GO | Stage-1 ffmpeg parity is conditional on the gate outcome (§8). |
| Crash recovery | P1 | **Inside `G1-CAPTURE`** (T7) and P2 | Which files exist after a crash depends on the container chosen by T7. |
| Bounded memory | P1 | Measured in the gates; fixes after them | Quick wins that are not gating are hygiene. |
| Domain v3 | not listed | **Behind both gates**; slices start only when a named dependency needs them | Not a parallel track: the gates need no v3 code. |

Execution is ordered by dependency, then by the cost of being wrong. Expensive work is always behind a measured gate, and no infrastructure is built before its justification.

---

## 2. Gates and order

### 2.1 Gate register (single home for gate names and criteria)

Other documents cite these IDs and do not restate thresholds. All numbers are **[P]**: proposals, not requirements, until `G0-THRESHOLDS` ratifies them and measurement on the target M1 8 GB confirms them.

| Gate | Was called | Question | Pass (GO) | PARTIAL | NO-GO consequence |
|---|---|---|---|---|---|
| `G0-THRESHOLDS` | — | Are the [P] numbers sensible for this machine? | After P0a, the owner reviews every number in §4 and the `G1`/`G2` criteria against the frozen baseline and records any change in `ADR.md` (ADR-10) **before** `G1-CAPTURE` runs | — | Gates cannot start; results would be judged against unratified numbers |
| `G1-CAPTURE` | "P1 PoC", "P1 native capture PoC" | Can native capture record topology M reliably, in sync, and recover after forced termination? | See §3 `G1-CAPTURE`: Tier 1 scenarios all pass | A named capability passes, others do not: native for those, Chromium for the rest | Keep Chromium capture; P2/P4 not started; ADR-1/2 revisited |
| `G2-RENDER` | "R-PoC", "P5a", "render spike" | Does WebGL2 + WebCodecs + the chosen mux path produce deterministic, A/V-synced, **playable finalized MP4/MOV** inside the pinned Electron? | See §3 `G2-RENDER`: R1–R10 and R13–R15 pass | Downgrades only (R4, R8, R9) recorded | Native Metal/AVFoundation fallback scoped; Stage-1 ffmpeg parity becomes the primary path |
| `G-SIGN` | "G-SIGN" | Can the nested helper carry its own entitlements under hardened runtime and still capture (ad-hoc/dev signing is enough for this gate)? | Own entitlements shown by `codesign`; camera + mic capture works under hardened runtime; reproducible from a clean checkout | A method other than A works | In-process addon (ADR-2 reopened), then Chromium capture for the affected capabilities |
| `G-TCC` | "G-TCC" | Which layout gives one permission entry per capability under the app's name? | One entry per permission, app name, survives relaunch and helper restart, revocation detected within 2 s [P]; **final confirmation repeated on the notarized build in `G-DIST`** | A non-L1 layout works | Fail ladder of `docs/adr/0000` §2e |
| `G-MCP` | — | Can the TypeScript `ovc-mcp` executable be packaged, signed and launched by an MCP client without `ELECTRON_RUN_AS_NODE`? | Packaged executable passes `codesign`, starts in ≤ 1 s [P] cold, completes a handshake with the Main gateway, works from `claude mcp add` stdio launch | Works only with bundled Node of a larger size | Swift `mcp-bridge` (ARCHITECTURE §7.1 option A) as fallback |
| `G-DIST` | — | Can a notarized, stapled DMG be produced and installed on a clean Mac? | Developer ID signing, notarization accepted, stapling valid, `spctl` accepts, `G-TCC` re-confirmed, app + helper + ffmpeg + `ovc-mcp` verified by `verify-mac-release` | — | No public distribution; technical results stand |
| `J1` (joint) | — | Does recording survive a concurrent WebCodecs export? | After both gates pass: T3 recording while a `G2-RENDER` S2 export runs: dropped frames, memory and thermal criteria of `G1-CAPTURE` still hold | Recording unaffected only with export throttled | Serialize record and export in the UI |

### 2.2 Order

```
P0a original baseline (frozen) ─► P0b-min (identity + update isolation + pinned Electron) ─► P0c re-baseline
                                                         │
                                       G0-THRESHOLDS (owner ratifies numbers)
                                                         │
          G-SIGN ∥ G-TCC (ad-hoc/dev signing) ─► G1-CAPTURE ─► G2-RENDER      (sequential measurement runs)
                                                         │
                  ┌──────────────────────────────────────┴───────────────────────────┐
         GO G1: P2 capture engine ─► P4 integration            GO G2: P5b shared render ─► P6 ─► P7 ─► P8
                  └──────────────────────────────┬───────────────────────────────────┘
                                         J1 (record ∥ export)
 P3.0, P3.1 … P3.11 domain slices start here, each only when P4/P5b/P9 names it as a dependency
 P9 MCP v2 needs G-MCP + P3.9 · P10 STT after P6 · G-DIST + P11 distribution when the owner has the accounts
 P0b-hygiene: non-blocking, any time after P0c
```

**Sequencing rules.**
- **Measurement runs never overlap.** `G1-CAPTURE` and `G2-RENDER` both stress the single M1 media engine and the same 8 GB; concurrent runs would corrupt both results. Code for `G2-RENDER` may be written while `G1-CAPTURE` hardware runs are idle, but no measured run of one starts while a measured run of the other is in progress. Order is risk-first: `G1-CAPTURE`, then `G2-RENDER`.
- **No domain v3 code before both gates**, except the specification in `DATA_MODEL.md`. The PoCs use isolated, throwaway time helpers reviewed against `DATA_MODEL.md` §2; `src/shared/time/` is productionized after the gates (P3.1).
- **A dependency, not a calendar, starts a slice.** P4 needs the time module and `MediaSource`/`TimeMap`/`CaptureSession` types (P3.1); P5b needs the read projection of the v2 document (P3.1); P9 needs P3.9.
- **Allowed parallelism** is limited to work with disjoint files and no shared hardware: the Swift protocol codec ∥ the TS protocol validator (shared fixtures); P6 proxies/peaks ∥ P7 audio plan after P5b; P10 ∥ P8.

---

## 3. Slices

Slice template: objective · changes · files · dependencies · acceptance · tests · performance · risks · rollback.

### P0a — Original baseline (no code change)

- **Objective:** measure the untouched `143a0d6` before anything changes; freeze the result.
- **Hard rules:** isolated detached worktree outside the repo; **external tooling only**; no dependency, identity, feature or code change precedes the freeze; two immutable result sets (`docs/baseline/original-143a0d6/`, `docs/baseline/post-hardening/`).
- **Steps:**
  1. **Check free space first** (`df -h`). Requirement [P]: >= 30 GB free on the worktree volume (install + build + two 10-min recordings; the 3–5 GB install/build footprint is an [S] estimate), and the system volume (swap) must not be nearly full. Last observed: **3.5 GiB free** on the repository volume (98% used), 12 GiB on the internal volume. **P0a is blocked until space exists.**
  2. `git worktree add --detach <path> 143a0d6`.
  3. Record environment (chip, macOS, power source, `pmset -g`, thermal state, displays, cameras, disk, Node/npm, Electron, SHA, lockfile hash).
  4. Toolchain: Node 22 to match CI (the machine has Node 24.18); `npm ci` only. Its `postinstall` downloads a SHA-256-pinned FFmpeg: a network fetch that **needs explicit approval**.
  5. Static baseline: `npm run verify:ffmpeg`, `typecheck`, `npx vitest run --reporter=verbose` x3 (flakiness), `build`, `test:mcp`, `ffmpeg -encoders | grep videotoolbox`. Failures are **recorded, not fixed**.
  6. Runtime baseline with scripts in `~/ovc-bench-tools/`: B0 idle, B1 startup, B2o recording on the MediaRecorder path (screen; screen+camera+mic; system audio if it works), B7o export of what the original supports (camera/layout export recorded as **N/A**, not zero), B8o transcription (model download needs approval).
  7. **Launch mode: unpackaged (`electron .`) or packaged with the network blocked.** A packaged run would contact upstream's update feed. Record the mode; a dev run and a packaged build differ in memory.
  8. N >= 3 per scenario, median and IQR, outliers kept; `powermetrics` needs sudo and is run by the user.
  9. Prove cleanliness (`git status` empty, `git diff 143a0d6` empty), freeze raw data + environment + checksum manifest.
- **Acceptance:** frozen report produced from a verified-clean worktree; real pass/fail documented including failures.
- **Risks:** disk (currently blocking); Electron 43.0.0 carries reported advisories, so run locally with no network features beyond approved fetches.
- **Rollback:** `git worktree remove`; delete the bench-tools directory.

### P0b-min — Fork identity, update isolation, pinned Electron (only after the P0a freeze)

- **Changes (minimum that blocks a gate or a packaged build):** new appId/productName/`publish`/Team ID (`package.json`, `scripts/verify-mac-release.mjs`, `.github/workflows/{ci,release}.yml`) — the **fork's Team ID needs the Apple Developer account of §7, which is not assumed**; until it exists the identity fields are retargeted and signing stays ad-hoc/development; `autoDownload` off until the fork feed exists (`src/main/auto-updates.ts`); bump Electron to the version intended for the product (>= 43.8.1 or current) and **record the pinned version** (`G2-RENDER` runs on it); arm64-only `mac.target.arch`, `mac.minimumSystemVersion`; gate `VITE_DEV_SERVER_URL` on `!app.isPackaged` (a one-line security fix).
- **Acceptance:** app builds under the fork identity; no packaged build contacts upstream's feed; Electron version pinned in the lockfile and recorded in `ADR.md` ADR-4.
- **Rollback:** identity and Electron bump are separate commits, reverted independently.

### P0b-hygiene — non-blocking, scheduled any time after P0c

zod and MCP SDK bumps; remove ACE-Step (`acestep_generate.py`, `music-generation.ts`, `tests/music-generation.test.ts`); drop the Windows matrix; CI: SHA-pinned actions, `npm audit`, scoped permissions, dependabot; decide `@vitest/coverage-v8`; commit ADRs. **Acceptance:** `npm audit` shows no high/critical in runtime dependencies (**reported 39 advisories, 3 critical / 28 high / 8 moderate, mostly dev tooling; re-measured after the bump**); CI green on macOS. Not on the critical path of either gate.

### P0c — Post-hardening baseline

Rerun the same scenarios with the same external harness. Add the in-repo harness (`scripts/bench/`, `--bench` bench-only IPC channel) and cross-validate it against the external one on one scenario (agree within 5% [P]) before it gates regressions. Output: delta report original → post-P0b-min isolating the Electron bump and arm64-only (ACE-Step removal is measured separately when hygiene lands).

### G0-THRESHOLDS — ratify the numbers

After P0a (and P0c) the owner reviews §4 and the `G1`/`G2` criteria against the frozen baseline: a threshold the baseline shows to be unreachable or meaningless is revised **in writing** (`ADR.md` ADR-10) before any gate runs. Without this step "proposed" numbers would be judged as if they were requirements. **Acceptance:** each [P] number in §4 and §3 is marked ratified or changed, with the reason.

### `G1-CAPTURE` — native capture proof of concept (go/no-go; formerly "P1"). **Not implemented now.**

Runs on the M1 8 GB after `G0-THRESHOLDS`, `G-SIGN` and `G-TCC` (core cells), and **never concurrently with a measured `G2-RENDER` run** (§2.2).

- **What to build:** standalone SwiftPM package `native/capture-poc/` with CLI `ovc-capture-poc`. No Electron, no UI. `list` and `record --display all --camera <id>,<id> --mic <id> --system-audio sck|tap --codec hevc|h264 --fps 30|60 --duration <s> --out <dir> [--pause-at <s>:<s>]`; stdout emits protocol v1 JSONL (dry-run); each source on its own serial queue feeding a per-track writer actor; shared host-clock anchor; 1 Hz stats; atomic manifest.
- **APIs:** `SCStream`/`SCContentFilter`, `AVCaptureSession` x N, `AVCaptureDevice` audio, `AVAssetWriter` + VideoToolbox (hardware required), LPCM, `CMSyncConvertTime`.
- **Topology M (mandatory):** 4 video tracks (internal display 2560x1600 native 30 fps; external 3440x1440 native 30 fps; built-in camera 1080p30; one USB camera 1080p30) + 2 audio (one mic by explicit ID, SCK system audio) = 6 files + manifest. Cameras on this Mac: FaceTime HD, Elgato Facecam 4K, Angetube Live; OBS Virtual Camera is excluded except one enumeration check.
- **Scenarios, tiered by whether they can invalidate the architecture.** The matrix is deliberately not exhaustive.
  - **Tier 1 (can kill a capability; all required for GO):**
    - **T2** both displays + mic + system audio, 30 min (concurrent `SCStream`s).
    - **T3** topology M, 30 min.
    - **T3E** — T3 **with the editor open** on a representative project (60-min, 4-source, scripted scrub/playback every few minutes), because the product records while editing.
    - **T3X** — T3 **while another export runs** (today's ffmpeg VideoToolbox export, the only export that exists at this point; `J1` repeats it with the WebCodecs export after `G2-RENDER`).
    - **T5** — topology M, **120 min at native display resolutions** (realistic source size; memory slope, thermal, disk).
    - **T6** sync clapper (full-screen flash + beep) including the 60-min drift measurement that decides `TimeMap.rateppm`.
    - **T7** forced termination, x20 per scenario and x100 random moments per container type for the container decision: `kill -9` of the helper; `kill -9` of Electron main while the helper lives (stdin EOF must finalize); `kill -9` of both. **Scope limit:** this covers process death, not power loss (`ARCHITECTURE.md` §9).
    - **T9** pause/resume x10 (decides pause method and cumulative offset).
    - **T12 memory pressure** — T3 with `memory_pressure` driven to *warn* by a controlled memory consumer (tool to be chosen; `memory_pressure` has a simulation mode [H, verify]). Expect: helper not killed, no dropped-frame budget breach attributable to the helper, background jobs shed.
    - **Thermal** — `ProcessInfo.thermalState` logged every 5 s in T3/T5 plus `powermetrics` run by the user; a `serious` state must not cause budget breaches, or a defined degrade mode must keep them within budget.
    - Multi-camera: candidate C1 on {built-in + one USB} (M2).
  - **Tier 2 (reported; a failure scopes a capability but does not kill the architecture):** T1 single display 10 min; T4 60 fps displays; T8 unplug camera/mic/display; T10 disk nearly full (sparse image); T11 sleep/wake; the camera trio; candidates C2–C6 unless C1 fails.
  - **`G-SIGN` and `G-TCC`:** `G-TCC` matrix reduced to cells that can change the layout decision — layouts L1 and L3, contexts Finder/Dock launch and dev `electron .` (negative control), states fresh account and relaunch after grant; L2 and L4 only if L1 fails.
- **Measurement:** footprint per process at 1 Hz (`footprint`, `ps`), `vmmap --summary` every 30 s, `memory_pressure`/`vm_stat`/`vm.swapusage` every 5 s, `iostat`, helper `stats`, `powermetrics` (user runs with sudo) for CPU/GPU power and thermal, ffprobe frame tables, sync analyzer (flash onset per video track, beep onset per audio track), recovery duration after kill.
- **Success [P] — go only if all hold on M1 8 GB (numbers ratified by `G0-THRESHOLDS`):** T3 30 min with dropped frames <= 0.1% per video track and zero audio discontinuities; **T3E and T3X hold the same dropped-frame and memory budgets** (whole app <= the §4 recording budget including the editor renderer, `memory_pressure` stays *normal* for T3, reaches *warn* at most in T12 without helper loss); **T5 at native resolution completes without a `serious` thermal state breaching budgets**; helper footprint <= 350 MB and slope <= 5 MB/10 min after 5 min in T5; start offset between any two tracks <= ±1 frame (33 ms) after correction; drift <= 20 ms over 60 min after correction; T7 >= 19/20 recoverable to <= 2 s before the kill; T8 lost device emits `device.lost` and the rest keep recording; T9 no cumulative offset (<= 1 frame) after 10 pauses; G-SIGN and G-TCC pass.
- **Failure → mitigations (bounded to 2 iterations):** lower display fps to 30; H.264 for cameras; second display at 1x scale; test single-session multi-input; switch audio to the process tap.
- **Kill criteria (stop native *for that capability*, keep the Chromium path for it):** T3 cannot meet dropped-frame **and** memory budgets after mitigations; two simultaneous UVC webcams cannot run; TCC cannot be attributed to the app identity in a shippable layout; fragmented writing is not recoverable and no alternative (segmented files every N s) meets T7. A partial kill is allowed (e.g. native displays + audio, Chromium webcams).
- **Deferred to after GO (not part of the gate):** the Chromium-engine manifest (per-track `performance.now()` at each recorder's `onstart` and first chunk written as `capture-session.json` with `engine: "chromium"`, differences only; `DATA_MODEL.md` §5) that removes `sourceStart: 0` placement [V `timeline-utils.ts:112`]; interim `avc1` MediaRecorder if `isTypeSupported`; 1080p/8 Mbps default; `powerSaveBlocker`; disk-space guard. These are P4 work. Revision 3 listed `captureOffsetTicks` here; that field is **removed** (never implemented [V]).
- **GO / PARTIAL / NO-GO:** GO = every Tier 1 scenario passes the ratified numbers (above). PARTIAL = a named capability passes (e.g. displays + audio native, webcams Chromium). NO-GO = T3 cannot meet dropped-frame **and** memory budgets after the bounded mitigations, or `G-TCC`/`G-SIGN` fail every rung: Chromium capture stays, P2/P4 are not started.
- **Outputs:** `bench/poc/<date>/` raw CSVs, manifests, ffprobe JSON, sync report, system info; ADR-0001 updated with measured numbers and the go / partial / no-go decision.
- **Rollback:** none needed (isolated).

### P2 — Capture engine (production `ovc-capture`) — starts only on `G1-CAPTURE` GO or PARTIAL

Session state machine; device loss/restore; disk guard; pause offsetting; drift compensation if required; stats/levels/thumbs; manifest v1; standalone `recover <sessionDir>`. **Acceptance:** `G1-CAPTURE` criteria hold on the production build; `recover` repairs 20/20 synthetic kills (CI) and >= 19/20 real kills (hardware). **Tests:** Swift unit + synthetic `CMSampleBuffer` writer tests, shared protocol fixtures, hardware nightly subset. **Rollback:** the helper is unused until P4 flips the flag.

### P3 — Domain v3, twelve reversible slices — **behind both gates; a slice starts only when a named dependency needs it**

Revision 3 ran this as a parallel track from the start. Revision 4 does not: nothing in `G1-CAPTURE` or `G2-RENDER` needs v3 code (the PoCs are isolated), and building the migration first would be infrastructure before its justification. Triggers: **P3.0–P3.1** when P4 or P5b is about to start (they need the time module, `MediaSource`, `TimeMap`, `CaptureSession` and the read projection); **P3.2–P3.8** as P5b/P6–P8 need operations or history; **P3.9** when P9 is scheduled. Slices are otherwise sequential (each depends on the previous).

Rule: each slice ships behind its own flag `domain.<slice>` (default off), has an equivalence/differential test and a one-step rollback. The legacy handler stays until the slice has soaked; legacy removed only in P3.11. There is never more than one writer; the persisted document keeps its revision-CAS full-snapshot save until P3.10.

| Slice | Scope | Depends on | Acceptance |
|---|---|---|---|
| P3.0 | Safety net: frozen v2 fixtures from real projects; golden tests for all 31 op kinds; Zod⇔TS drift test (fixes `set_text_overlay`/`set_background` drift); time-suffix lint scaffold | — | Existing + new tests pass; drift test fails on a deliberately drifted type |
| P3.1 | `src/shared/time/` implementing `DATA_MODEL.md` §2 (A1–A3, boundaries 1–9, property tests a–g); v3 types including `MediaSource.timeMap`, `CaptureSession`, typed registry; migration registry v1→v2→v3 as pure read-only functions; Immer document-size measurement | P3.0 | Fixtures round-trip within 1 tick; v2→v3→v2 projection equals the original; time property tests pass |
| P3.2 | Renderer document store and `dispatch(ops)` adapter, no feature migrated | P3.1 | No-op dispatch reproduces the current save payload exactly |
| P3.3 | Timeline segments (move, trim, split, delete, ripple) via ops | P3.2 | Differential traces identical; undo/redo identical on recorded traces |
| P3.4–P3.7 | Audio levels · zoom/speed · text/subtitles · layout/camera/background/corners | P3.3 | Differential traces identical |
| P3.8 | One transactional history replaces the segment-only undo stack | P3.3–P3.7 | Property test: op then inverse returns the identical document for every op kind |
| P3.9 | Main-process `DocumentService` authoritative; renderer = optimistic replica | P3.8 | Commit round-trip p95 <= 50 ms [P]; rejected commit rolls back; gesture frame rate unchanged |
| P3.10 | Default writer flips to schema v3; v2 backup kept | P3.9 + soak [P: 2 weeks] | open → save → open lossless |
| P3.11 | Remove legacy handlers; stop writing `edits.json`/`subtitles.json` | P3.10 | Grep/lint: no direct document-field mutation remains |

Files: `src/shared/editor-domain/{types,schema,operations,operation-schema}.ts` + new `migrations/`, `history.ts`; new `src/shared/time/`; renderer `useTimelineEditing.ts`, `useEditorPersistence.ts` and timeline hooks (one slice at a time); `src/shared/types.ts` (dedupe `EditorProjectStateFile`). Perf: history cap [P 200 entries / 32 MB]; apply p95 <= 16 ms on a 60-min project [P]. Risk: the renderer is ~22k lines; mixing legacy and migrated handlers (mitigated by dual-run and a unified undo controller).

### P4 — Electron / native integration

Needs `G1-CAPTURE` GO/PARTIAL and **P3.1**. `CaptureEngine` interface (`native` | `chromium`), supervisor (spawn, handshake, heartbeat, restart policy), IPC gateway for recorder channels, session import → `CaptureSession` + `MediaSource.timeMap` from the manifest (native, Chromium and recovery all emit the same structures; no offset field), Chromium-engine manifest writer, launch-time recovery, permission onboarding, flag `capture.engine`, packaging and signing per the G-SIGN/G-TCC result. **Files:** `src/main/capture/{protocol,supervisor,native-engine,chromium-engine,recovery}.ts`, `src/main/process-supervisor.ts` (generalized from `runProcess`, `src/main/ffmpeg.ts`), `project-store.ts`, `RecorderController.tsx`, `desktop-permissions.ts`, `package.json` build, `scripts/after-pack.cjs`, `verify-mac-release.mjs`. **Acceptance:** T3-load recording from the app; exported result's sync <= 1 frame; forced quit mid-recording is recovered at next launch; Chromium engine still works behind the flag. **Rollback:** `capture.engine=chromium`.

### `G2-RENDER` and P5 — render parity (the gate first; formerly "R-PoC" / "P5a")

- **`G2-RENDER` (timebox <= 3 weeks [P]; Revision 3 assumed 2 weeks for a smaller scope; starts after `G1-CAPTURE` measured runs end, §2.2).** Proves the **entire** pipeline of `ARCHITECTURE.md` §4.3 — index/demux, decode, frame scheduling, WebGL2 compositing, `VideoEncoder`, audio mix, mux and a **finalized, playable MP4/MOV** — in the **pinned Electron** (hidden `BrowserWindow` with production flags, not a standalone browser). Scenes S1 (single 1080p clip), S2 (2560x1600 screen into a 1920x1080 canvas + circular-masked camera with border/shadow + background + text + crossfade), S3 (S2 + animated zoom + karaoke subtitles); inputs H.264/HEVC, CFR/VFR, edit lists/B-frames, 60 fps variant; synthetic `lavfi` sources for determinism **plus at least one real `G1-CAPTURE` helper output** for the VFR/edit-list tests (R3). Tests **R1–R12** and thresholds in `docs/adr/0000` §2i (unchanged identifiers), plus Revision 4 additions:
  - **R13 — audio mix and A/V sync on the finalized file.** `AudioMixPlan` (mic + system audio) rendered by ffmpeg, AAC priming handled, final file decoded and the flash/beep offset measured: <= 1 frame (33 ms) [P] at the start and at the end of a >= 10 min output.
  - **R14 — finalized-file validity and playability.** The exported MP4/MOV passes `ffprobe` structural checks, a full ffmpeg decode with no errors, Chromium `<video>` playback and QuickTime Player/AVFoundation open-and-play (manual for the gate; automation choice open); `colr` and codec tags as specified in `ARCHITECTURE.md` §4.3 stage 9; faststart honored.
  - **R15 — target runtime.** All R-tests run inside the pinned Electron's hidden renderer with the production flags; the hardware evidence (R6) is taken there. R1/R6/R7 are re-run on any later Electron major or minor bump.
  - **Mux decision:** candidate paths M1/M2/M3 of `ARCHITECTURE.md` §4.3 are tried in that order; the first that passes R13/R14 is recorded in ADR-5. Demux candidates D1/D2 likewise (R3).
  - "1.0x realtime" = output duration ÷ wall-clock from export request to verified finalized file, median of 3 runs of >= 5 min each, AC power, cold and warm reported separately. R6 hardware proof needs an OS-level confirmation, not just `isConfigSupported`.
  - **GO / PARTIAL / NO-GO:** GO = R1–R10 and R13–R15 pass; PARTIAL = only downgrades (R4, R8, R9) recorded; NO-GO = a hard kill of `ARCHITECTURE.md` §4.4 → native fallback scoped (R12), Stage-1 ffmpeg parity becomes the primary path.
- **5b Stage 1 (incremental ffmpeg parity) — conditional:** built if `G2-RENDER` is PARTIAL or NO-GO, or earlier only on an owner decision (§8). `src/shared/render/` scene evaluator (moving `layout-geometry.ts`, `zoom-utils.ts`, text metrics, playback sync); drive CSS preview **and** ffmpeg export for static layouts from the same scene; delete hand-copied constants; capability flags `cameraCompositing`/`layouts` become true only when parity tests pass.
- **5b Stage 2 (starts on `G2-RENDER` GO/PARTIAL):** compositor in `src/renderer/render/`, export in a hidden renderer, flag `export.engine`.
- **Acceptance:** camera, layouts, backgrounds, corners, zoom, transitions and text export identically (golden SSIM >= 0.98 for export-vs-scene [P]; compositor-vs-compositor >= 0.999 per R10); 60 fps and source dimensions truthful (today forced 30 fps and 1080p substitution [V `ffmpeg.ts:317,690`]); bitrate scaled by resolution.
- **Files:** `useEditorDerivedData.ts`, `PreviewContent.tsx`, `PreviewVideo.tsx`, `PreviewTransitionLayer.tsx`, `TextOverlayLayer.tsx`, `composition-export.ts`, `editor-export.ts`, `ffmpeg.ts` (split), `src/mcp/server.ts` capability flags. **Rollback:** `export.engine=ffmpeg-legacy` (which includes camera and layout only if Stage 1 was built; otherwise it is the current feature-reduced export and is labelled as such).

### P6–P11 (summaries) — all start only after the gates named in §2.2

| Slice | Objective and key tasks | Acceptance / rollback |
|---|---|---|
| P6 Preview on 8 GB | Background job queue (pauses during record/export); 720p proxies; ffmpeg audio peaks; sprite thumbnails; LRU byte-capped caches; remove renderer whole-file decode (`media-utils.ts:320-345`) | B5/B6 budgets; editor renderer within §2f budget on a 60-min project; proxies optional per project |
| P7 Audio | One `AudioMixPlan`; `acrossfade` transitions; `alimiter`; optional two-pass `loudnorm`; per-track gate/compressor/EQ; explicit mic constraints | Numeric parity RMS/peak ±0.5 dB, LUFS ±1 LU [P]; no clipping above −1 dBTP with the limiter on; processing nodes default off |
| P8 Overlays/templates | Overlay tracks; keyframes; template schema/library; shared Canvas raster cache; styled subtitles in the compositor; optional cursor/click sidecar | Parity goldens per template and style; templates additive |
| P9 MCP v2 | **Needs `G-MCP` + P3.9** (+ both gates). App AI gateway in Main (socket + token); TypeScript `ovc-mcp` executable replacing the `ELECTRON_RUN_AS_NODE=1` launch [V `ai-connection.ts:84,89`], then fuse `runAsNode:false`; proposal store + approval UI; typed tool groups; jobs with progress/cancel; `render_frame`; Gemini on the same gateway with consent + DELETE | Agent can analyze, propose, preview, get approval, export; every destructive op approved; closed app → `APP_NOT_RUNNING`; legacy `apply_edit_plan` stays one release behind a flag; fake-gateway protocol tests pass |
| P10 STT | One quantized pipeline (Transformers.js in a `utilityProcess` or whisper.cpp/Metal, chosen by B8); streamed PCM windows; dispose after use; pinned model; scene-change/loudness/mistake analyses for AI | B8 budget; cloud STT stays |
| P11 Distribution (`G-DIST`) | **Requires the §7 prerequisites.** Fork update feed + signed metadata; helper and `ovc-mcp` signing verification; fuses (`runAsNode:false`, `enableCookieEncryption`, `grantFileProtocolExtraPrivileges:false`); sandbox where feasible; license report; source offer; legal items; optional LGPL FFmpeg evaluation | `verify-mac-release` covers app + helper + `ovc-mcp` + ffmpeg; notarized, stapled DMG installs on a clean Mac (macOS versions actually tested); `G-TCC` re-confirmed on the notarized build; update from the fork feed tested |

---

## 4. Performance and quality budgets (all **proposed [P]**: ratified by `G0-THRESHOLDS`, then **proposed until measured on the target M1 8 GB machine**)

| Metric | Proposed target | How measured |
|---|---|---|
| Idle RAM (B0) | <= original-baseline footprint −20%; CPU ~0% | Footprint of the process tree after 5 min at the home screen |
| RAM, recording topology M | whole app <= 2.0 GB; helper <= 350 MB | `footprint` per process at 1 Hz + `memory_pressure`; **not RSS** |
| Peak RAM, editing (60-min, 4-source project) | idle <= 2.0 GB; playback <= 2.5 GB; editor renderer <= 700 MB | Same sampler |
| Peak RAM, export | whole app <= 3.0 GB; export renderer + GPU <= 1.5 GB | Same sampler |
| CPU | Native recording <= 50% of the MediaRecorder CPU from P0a; ~40% total in T3 | `ps`/`top` per process |
| GPU | Reported, no gate until measured | `powermetrics --samplers gpu_power` (user runs with sudo) |
| Disk throughput | 263–413 MB/min for topology M [S]; no `DISK_SLOW` | `iostat`, helper `stats`, file sizes |
| Dropped frames | <= 0.1% per video track; zero audio discontinuities | Frames written vs expected from timestamps |
| A/V sync | start offset <= ±1 frame (33 ms); drift <= 20 ms over 60 min | T6 clapper analyzer |
| Recording start latency (Record click → first frame on all tracks) | warm helper <= 1.5 s [P] | Helper `track.started` host times vs click |
| Warm app start to interactive (B1) | <= 2 s | Timed externally |
| Export speed (B7) | >= 1.0x realtime on S2 1080p30; target >= 1.5x | Definition in `G2-RENDER` |
| Recording under editor load (T3E) and concurrent export (T3X, `J1`) | Same dropped-frame and memory budgets as plain T3 | `G1-CAPTURE` scenarios |
| Finalized export A/V sync (R13) | <= 1 frame (33 ms) at start and end of a >= 10 min file | Flash/beep analysis on the finalized file |
| Scrub/seek (B6) | p95 <= 150 ms; 30 fps with 2 video layers on 720p proxies | Instrumented |
| Thermal | no `serious` thermal pressure in T3; sustained throughput logged over T5/B4 | Helper logs `ProcessInfo.thermalState`; `powermetrics thermal` |
| Memory slope | <= 5 MB per 10 min per process after warm-up | 120-min run |

Methodology: real workloads only (native-resolution screens, 1080p cameras, 30-120 min runs), not 320x180 clips; N >= 3 with median and IQR; AC power; no other foreground apps; cold and warm runs separate; every result states its metric, launch mode and environment; a comparison script rejects results that cite only RSS.

---

## 5. Test strategy

### 5.1 Reuse, modify, retire (real file names, 78 test files)

| Disposition | Files | Notes |
|---|---|---|
| **Reuse as the regression net** | `editor-domain`, `operation-schema`, `editor-document-safety`, `editor-persistence-flush`, `project-store`, `project-library`, `project-containment`, `project-deletion`, `media-import`, `media-range`, `playback-clock`, `playback-sync`, `layout-geometry`, `layout-snapping`, `zoom-utils`, `zoom-timing`, `speed-utils`, `transition-utils`, `timeline-*` (clipboard, links, move, playhead, selection), `subtitle-*`, `stt-cloud`, `stt-errors`, `export-jobs`, `ffmpeg-progress`, `ffmpeg-release-scripts`, `provider-keys`, `request-validation-ai`, `gemini-*` | Keep passing on every slice; baseline pass state is unknown until P0a |
| **Modify** | `timeline-utils` (the `sourceStart: 0` placement test, P4); `composition-export`, `editor-export*` (engine change; keep the real-FFmpeg pattern); `ffmpeg.test` (when `ffmpeg.ts` is split); `recording-runtime`, `recorder-controller-view` (behind `CaptureEngine`); `display-overlay`/`source-overlay-state` (only if the overlay is kept) | Each change documented with a reason |
| **Retire** | `prepare-mas-profile`, `ffmpeg-windows-release-scripts`, `music-generation` | With MAS, Windows and ACE-Step |

### 5.2 New, essential (ranked)

1. **Recorder state machine** (start/pause/resume/stop/abort/device-lost) with a fake helper speaking protocol v1.
2. **Sync contract:** `TimeMap`/`CaptureSession` from native and Chromium manifests applied at import; importer reproduces synthetic offsets, calibration and jumps to <= 1 tick; overlap → `TIMEMAP_OVERLAP`; drift cases once enabled. **Time arithmetic:** the property tests a–g of `DATA_MODEL.md` §2 (fast path vs `bigint`, `checkedTicks`, sample/frame registries).
3. **Crash recovery:** project in `recording`/`processing` at launch → recovered; fake-helper kill at random points (CI), real `kill -9` (hardware).
4. **Preview/export golden-frame parity:** same `RenderScene` → preview frame vs export frame within tolerance.
5. **Export correctness:** 60 fps preserved, "source" truthful, limiter bounds, hardware encoder present and used, color tags.
6. **IPC gateway:** per channel schema-reject, sender-reject, happy path; media protocol containment and origin.
7. **Memory budgets:** subtitle path under a fixed footprint ceiling on a long recording; many-segment export under a decoder-count ceiling (hardware).
8. **MCP integration:** move `scripts/test-mcp-smoke.mjs` into Vitest; contract tests per tool (proposal lifecycle, idempotency, approval-denied, `APP_NOT_RUNNING`, scope); AI `import_media` consent flow; **fake-gateway tests** for the `ovc-mcp` ↔ Main socket protocol (handshake, token rejection, wrong-uid rejection, version mismatch, `seq` gaps).
9. **Clip timing and transitions:** speed validity (zero/negative/out-of-range rejected), derived duration, source-bound and overlap rules, snap behavior, registry rejection of unknown transitions, v2→v3 transition map.

### 5.3 Layers

| Layer | Tooling | Runs where |
|---|---|---|
| Unit (domain, time, scene evaluator goldens, migrations, drift) | Vitest (existing) | CI every push |
| Native Swift (clock math, pause offsetting, manifest atomicity, protocol codec, writer with synthetic `CMSampleBuffer`s) | Swift Testing / XCTest in SwiftPM | CI macOS runner (no TCC needed) |
| IPC contract | Shared JSON fixtures in `native/protocol/fixtures/`, TS + Swift | CI |
| Electron IPC / main integration | Vitest + fake helper (Node script speaking protocol v1) | CI |
| FFmpeg integration | Vitest + pinned ffmpeg (existing pattern) | CI |
| Compositor parity | Playwright `_electron` (new dependency, P5), SSIM/PSNR thresholds | CI (software GL) + hardware nightly |
| UI end-to-end | Playwright `_electron` | CI smoke; full on hardware |
| MCP (tools and `ovc-mcp` ↔ Main protocol) | Vitest contract tests + fake gateway | CI |
| Hardware benchmarks | `swift test --filter Hardware`, `scripts/bench/` | Dedicated M1 8 GB self-hosted runner (label `m1-8gb`), TCC granted once, nightly + pre-release |

GitHub-hosted macOS runners are VMs without cameras or TCC grants, so hardware tests never run there. CI uses synthetic and fake sources. Coverage is judged by risk, not percentage: every domain op, migration, IPC channel, protocol message and MCP tool has an accept and a reject test; every recovery path a kill test; every visual feature a parity golden.

---

## 6. Risk register (top)

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| 1 | Encoder saturation: 2 Retina displays + 2 cameras on one M1 media engine, worse with the editor open or an export running | Unknown / kills topology M | `G1-CAPTURE` T3/T3E/T3X; fallbacks F1/F2; hardware encoder required so failure is loud |
| 2 | Concurrent `SCStream`s and multi-camera concurrency do not work on M1 | Unknown / high | T2 and camera C1; fall back to Chromium capture for the affected source |
| 3 | TCC attribution/signing layout fails (`G-TCC`, `G-SIGN`) | Medium / high | Layout ladder, then in-process addon (ADR-2 reopened) |
| 4 | WebCodecs seek/step/VFR non-determinism, no proven hardware encode, or **no mux path yielding a playable A/V-synced file** | Medium / high | `G2-RENDER` (R1–R15); candidates M1/M2/M3; native Metal fallback in the helper |
| 5 | Domain refactor of a ~22k-line renderer | High / medium | Deferred behind both gates; 12 reversible slices, dual-run, flags |
| 6 | 8 GB memory pressure with several decoders + WebGL, and under system memory pressure | High / high | Footprint budgets, decoder caps, proxies, export in its own process; T12 |
| 7 | Only macOS 26.5.2 hardware available; 14.2/15 untested | High / medium | Raise the supported minimum to the lowest tested version |
| 8 | Disk: 3.5 GiB free blocks P0a and recording tests | Certain now / blocking | Free space or add a >= 100 GB external SSD before P0a |
| 9 | **No Apple Developer account / Developer ID / notarization credentials** | Unknown (owner has not confirmed) / blocks distribution, not feasibility | §7 prerequisites; feasibility gates run on ad-hoc/dev signing; `G-DIST` waits |
| 10 | **`ovc-mcp` packaging** (Node single-executable or bundled Node: size, signing, start time) | Unknown / medium | `G-MCP`; fallback Swift `mcp-bridge` |
| 11 | **Pinned Electron changes under `G2-RENDER` results** | Medium / medium | Pin in P0b-min; re-run R1/R6/R7 on any bump |
| 12 | **Gate numbers judged as requirements before they are calibrated** | Medium / medium | `G0-THRESHOLDS` |

---

## 7. Distribution prerequisites (not assumed to exist)

Technical feasibility and distribution readiness are separate questions. Feasibility gates (`G1-CAPTURE`, `G-SIGN`, `G-TCC`, `G2-RENDER`, `G-MCP`) can run with ad-hoc or development signing on the working Mac. **Public distribution (`G-DIST`) cannot.** The owner has not confirmed that any item below exists; each is a prerequisite, and a missing one blocks `G-DIST`, never a feasibility gate.

| # | Prerequisite | Needed for | Status |
|---|---|---|---|
| D1 | Apple Developer Program membership (paid) held by the owner or the fork's organization | Developer ID certificate, notarization | **Unconfirmed** |
| D2 | Developer ID Application certificate (with private key) in the signing keychain and in CI secrets | Signing app, helper, `ovc-mcp`, ffmpeg | **Unconfirmed** |
| D3 | Notarization credentials (App Store Connect API key or app-specific password) available to `notarytool` locally and in CI | Notarization, stapling | **Unconfirmed** |
| D4 | The fork's own Team ID replacing upstream's in `package.json`, `scripts/verify-mac-release.mjs`, `release.yml` [V: current Team ID is upstream's] | Identity, `verify-mac-release` | Blocked by D1 |
| D5 | Helper and `ovc-mcp` signed with their own entitlements under the hardened runtime, and verified by the extended `verify-mac-release` | `G-SIGN` (feasibility) then `G-DIST` | Method decided by `G-SIGN` |
| D6 | CI secret handling (certificate import, notarization key, no secrets in logs, scoped permissions) | Automated release | Blocked by D2/D3 |

`G-TCC` runs first on ad-hoc/development signing and is **repeated on the notarized build** because TCC attribution can differ [H]. Nothing in the roadmap assumes D1–D6 are in place; the first action on them is an owner decision (§8).

---

## 8. Decisions needed from the owner

1. **Apple Developer account:** does one exist (D1), and is a Developer ID certificate available (D2)? If not, `G-DIST` is deferred and the DMG can only be ad-hoc signed for local use.
2. **Minimum macOS:** 14.2 requires 14.2/15 hardware or boot volumes for `G-TCC`; otherwise the minimum is raised to the lowest tested version (only macOS 26.5.2 is available today).
3. **Storage:** a >= 100 GB external SSD for `G1-CAPTURE` recordings, and >= 30 GB free for P0a.
4. **Stage-1 ffmpeg parity:** build it early for camera-in-export value, or only if `G2-RENDER` is PARTIAL/NO-GO (recommended default: only then).
5. **Threshold ratification** (`G0-THRESHOLDS`): who approves and when (after P0a/P0c).
6. **Intel support:** assumed dropped (arm64-only).
7. **Fork name and trademark** relative to "Open Video Craft" (legal item).
8. **Replacing `docs/adr/*` Rev 2 text with pointers** to these four documents (kept untouched for now; `ADR.md` carries the supersession table).
