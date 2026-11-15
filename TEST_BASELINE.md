# TEST BASELINE — Open Video Craft (static inventory)

- **Baseline:** `main` @ `143a0d6` (v1.0.6, unreleased; latest stable release `v1.0.5`). Date 2026-11-15.

## 0. READ THIS FIRST — nothing was executed

**No test, build, typecheck or script was run.** The constraint for this audit was "do not install dependencies"; `node_modules` is absent, and the test suite needs `npm ci`, whose `postinstall` downloads and overwrites an FFmpeg binary (`scripts/prepare-ffmpeg.mjs`). Therefore:

| Item | Status |
|---|---|
| Pass/fail result of the suite | **UNKNOWN — not run** |
| Test duration, flakiness, coverage % | **UNKNOWN — not measured** (no coverage config exists either) |
| Typecheck / build status | **UNKNOWN — not run** |
| Everything below | **Static inventory** from reading files and `grep` counts |

Environment of this machine at audit time: Node v24.18.0. CI uses Node 22 (`ci.yml`), so even a local run would not reproduce CI exactly.

## 1. Test infrastructure (verified by reading config)

- Runner: **Vitest ^4.1.9** (`package.json:188`), default environment `node` (`vite.config.ts:62-68`), `include: tests/**/*.test.ts`. `tests/ffmpeg-release-scripts.test.ts` is excluded on Windows only.
- DOM-ish tests use `jsdom ^29.1.1` via per-file environment directives (e.g. `api-key-card`, `chat-message-bubble`, `editor-shortcuts`). No `@testing-library`, no Playwright/Electron e2e runner in `package.json`.
- No coverage provider configured. No snapshot/visual regression. No performance/memory test.
- Commands: `npm test` (= `vitest run`), `npm run typecheck`, `npm run test:mcp` (builds main, runs `scripts/test-mcp-smoke.mjs` outside Vitest).

## 2. Inventory (measured with `ls` / `grep`)

- **78 test files, 7,549 lines, ~367 test cases** (count = lines matching `^\s*(it|test)(.each)?\(`; `.each` rows are not expanded, so this is a lower bound).
- Largest files by case count: `ffmpeg-release-scripts` 16, `editor-domain` 15, `timeline-links` 14, `timeline-playhead` 14, `timeline-utils` 14, `ffmpeg` 12, `timeline-move` 11, `request-validation-ai` 10.

### Coverage map by area

| Area | Files (case count) | What they actually assert | Verdict |
|---|---|---|---|
| Editor domain / operations | `editor-domain` (15), `operation-schema` (2), `editor-document-safety` (4), `editor-persistence-flush` (7) | v1→v2 migration, ripple removal, effect overlap rejection, transitions only at cuts, stale-lock recovery, path containment, flush behavior | **Good** — strongest area; PRESERVE as the regression net for the domain |
| Timeline UI logic | `timeline-*` (clipboard, links, move, playhead, selection, utils), `zoom-*`, `speed-utils`, `transition-utils`, `layout-*`, `video-corners` | Pure helper functions | Good for logic; no rendering/interaction e2e |
| Playback / preview | `playback-clock` (5), `playback-sync` (9), `preview-quality` (2) | Pure drift/clock decisions; localStorage preference | Pure logic only; no decoding, no multi-`<video>` behavior, no memory |
| Export / FFmpeg | `composition-export` (5), `editor-export*` (4 files), `ffmpeg` (12), `ffmpeg-progress` (3), `export-jobs` (1) | `composition-export` and `editor-export` **spawn the real FFmpeg** via `resolveFfmpegPath()` on tiny synthetic lavfi clips (320×180, 1–2 s) and probe duration/streams; `ffmpeg.test` asserts filter strings, `canStreamCopy`, overlay wrapping | **Moderate** — real-binary smoke exists, but only toy-size inputs. None cover camera/layout/background (not implemented), color, fps, loudness/clipping, videotoolbox, 4K, many segments, memory |
| FFmpeg supply chain | `ffmpeg-release-scripts` (16), `ffmpeg-windows-release-scripts` (3) | Pinned archive URLs/checksums, nonfree rejection, universal-binary routing | Good; does not assert `videotoolbox` encoders exist |
| Recording / capture | `recording-runtime` (2), `recorder-controller-view` (3), `permission-onboarding` (1), `display-overlay` (5), `source-overlay-state` (2) | Runtime option values, view rendering, overlay geometry, copy | **Weak** — no recorder state machine, no `recorder-utils`, no sync offsets, no crash recovery, no `desktop-sources`/`desktop-permissions` |
| Project storage | `project-store` (8), `project-library` (2), `project-containment` (4), `project-deletion` (2), `media-import` (2), `media-range` (3) | Folder naming, per-track `bytesWritten`, serialized concurrent writes, traversal/junction rejection, extension allow-list, range parsing | Good for storage; no crash-mid-write recovery test |
| Subtitles / STT | `subtitle-*` (8 files), `stt-cloud` (9), `stt-errors` (2), `subtitles-panel` (5) | Segmentation, timecodes, export formats, cloud chunking/errors | Good logic; not the whole-file RAM decode path or Whisper memory |
| AI / keys / validation | `gemini-agent` (8), `gemini-chat-hook` (6), `provider-keys` (6), `request-validation-ai` (10), `api-key-card` (2), `music-generation` (7) | Request validation, key store behavior, job flow | Moderate; no test for `providers:reveal`, plaintext fallback consent, or upload consent |
| UI shells | `home-dashboard`, `editor-*`, `export-dialog`, `changelog-dialog`, `chat-*`, etc. | Render/behavior of small components | Shallow |
| Packaging | `prepare-mas-profile` (2) | MAS profile script | Out of scope for a non-MAS fork |

### Not covered by any Vitest file (verified by filename/import search)

`src/main/main.ts` (all 62 IPC handlers), `media-protocols`, `auto-updates`, `app-status-ipc`, `desktop-permissions`, `desktop-sources`, `ai-connection`, `editor-analysis` (main-process Whisper), `project-file`, `security-scoped-resources`, `app-shell`, `src/preload/preload.ts`, `src/mcp/server.ts` (only the out-of-band smoke script below), and the renderer `RecorderController`, `recorder-utils`, `media-utils` (audio decode), thumbnail/filmstrip code.

### MCP smoke script (outside Vitest)

`scripts/test-mcp-smoke.mjs` boots the built server over stdio and checks tool listing, project inspect and scope rejection. It cannot detect the broken AI `import_media` path or export capability gaps.

## 3. CI (verified by reading `.github/workflows/*.yml`)

`ci.yml` — on every push and PR, matrix `macos-latest` + `windows-latest`, Node 22: `npm ci` → `verify:ffmpeg` → `typecheck` → `npm test` → `build` → `test:mcp`. `permissions: contents: read`. No `npm audit`, CodeQL, dependabot or `concurrency`. Actions pinned by tag (`@v4`, `actions-rust-lang/setup-rust-toolchain@v1`), not SHA.

`release.yml` — on `v*` tags / manual dispatch: version-vs-tag check, source-offer job, signed/notarized macOS builds (`--x64 --arm64`), unsigned Windows x64, draft → publish with `SHA256SUMS.txt`. Workflow-wide `contents: write`. No provenance attestation.

Implication: because CI runs `npm ci` + `npm test`, the FFmpeg-backed export tests are expected to run on macOS CI. Their actual pass state on `main` was **not checked** (no CI run history was queried).

## 4. Known risks to the baseline itself

1. Any later local run must accept the `postinstall` network download of an FFmpeg zip (SHA-256 pinned, but still a network fetch) and the `ffmpeg-static` package's own install download.
2. Local Node (24.18) ≠ CI Node (22); use `nvm`/`fnm` to match before comparing results.
3. FFmpeg-backed tests are only as faithful as the binary they pick up (`resolveFfmpegPath`): a different FFmpeg build yields different results.
4. The ~367 count is grep-derived; `.each` and dynamically generated cases make it a lower bound.

## 5. How to establish a *measured* baseline (needs your explicit go-ahead)

Run in a throwaway copy, not in this tree, so the fork stays clean:

```bash
cp -R "/Volumes/Scheda SSD/openvideocraft" /tmp/ovc-baseline   # or: git worktree add
cd /tmp/ovc-baseline && git clean -fdx -e '!*'                 # no node_modules yet
nvm use 22
npm ci                    # runs postinstall: downloads pinned FFmpeg 8.1.2 (network)
npm run verify:ffmpeg
npm run typecheck
npx vitest run --reporter=verbose 2>&1 | tee test-run.log
npm run test:mcp
npx vitest run --coverage   # needs @vitest/coverage-v8 added; not currently a dependency
```

Record: pass/fail per file, total duration, which FFmpeg tests ran vs were skipped, and `ffmpeg -encoders | grep videotoolbox` from the pinned binary. Note free disk: this volume was at 98% (3.5 GiB free) at audit time; `node_modules` plus Electron will need more.

## 6. Tests the fork should add first (ranked)

1. **Sync/capture contract:** per-track `startOffsetMs` stored and applied; recorder state machine (start/pause/resume/stop/abort).
2. **Crash recovery:** project in `recording`/`processing` at launch → remuxed, probed, marked recovered.
3. **Preview/export parity:** golden-frame tests (same project → preview geometry vs exported frame) once a shared compositor exists.
4. **Export correctness:** 60 fps preserved, "source" resolution truthful, loudness/clipping bound, videotoolbox encoder present and used.
5. **Memory budgets:** long-recording subtitle path stays under a fixed RSS ceiling; many-segment export under a decoder-count ceiling (run on a Mac with an 8 GB limit).
6. **IPC/protocol:** schema validation and sender allowlist per channel; `ovc-media`/`ovc-import` containment; AI `import_media` consent flow.
7. **MCP:** move the smoke script into the suite and extend to export capability flags.
