# P0a — Original baseline report (FROZEN as a reduced baseline: static + startup only)

> **Owner decision, 2026-11-15:** this reduced baseline is accepted as the "before" reference. It is frozen: do not edit `raw/` or the numbers below; any later correction is a new dated addendum. B2o/B7o/B8o remain open and, if run later, must be added as separate files and not described as part of this freeze.

- **Target:** `143a0d63b773598adb132015ec6857591ca8bc10` (v1.0.6, unreleased), clean checkout.
- **Date:** 2026-11-15.
- **Status:** **frozen as a reduced baseline (owner-accepted).** The Revision 4 prerequisite of >= 30 GB free on the worktree volume was **not met**; the owner chose to run the static part on the internal volume (8-11 GiB free). The recording, export and transcription scenarios (B2o, B7o, B8o) were not run.

## Environment

Apple M1, 8 GB, macOS 26.5.2, AC power, thermal state nominal (no warning levels recorded). Node v22.23.1 (CI parity; the machine default is v24.18.0), npm 11.x. Electron 43.0.0, Vitest 4.1.9, TypeScript 6.0.3, Vite 8.1.2. `package-lock.json` sha256 `d48378ed4d172c4bb6939a2a5992196873c165cc0d2776973974edff55b1684f`. Raw data: `raw/`.

## Deviations from IMPLEMENTATION_PLAN §P0a

1. **Isolation:** a local `git clone --no-checkout` + `git checkout --detach 143a0d6` on the internal volume instead of `git worktree add`, so that nothing is written to the source repository's volume (its APFS container is corrupt, see below). Same commit, same effect.
2. **Disk:** < 30 GB free (acceptance prerequisite unmet, see Status).
3. **`npm ci --no-audit --no-fund`**: no registry audit traffic. The `postinstall` downloaded the SHA-256-pinned FFmpeg 8.1.2 (macOS arm64) as designed.
4. **Runtime sampling:** `ps` RSS and CPU% at 1 Hz summed over the app's process tree (matched by an isolated `--user-data-dir`), plus one `footprint` snapshot per run. The plan prefers `footprint` per process; RSS overstates shared pages.
5. **No `powermetrics`** (needs sudo, to be run by the owner).

## Static baseline (original code, no fixes applied)

| Check | Result |
|---|---|
| `npm ci` | exit 0, 678 packages, 19 s, `node_modules` 793 MB |
| `npm run verify:ffmpeg` | exit 0, "Verified release-safe FFmpeg" |
| `npm run typecheck` | exit 0 |
| Lint | **no lint script exists** in `package.json` |
| `vitest run` x3 | 3/3 identical: 78 files, **382/382 tests passed**, 6.1-8.0 s, no flakiness observed |
| `npm run build` | exit 0; warning: renderer chunk `index-*.js` 735 kB (> 500 kB limit) |
| `npm run test:mcp` | exit 0, "MCP smoke test passed" |
| videotoolbox encoders in bundled ffmpeg | `h264_videotoolbox`, `hevc_videotoolbox`, `prores_videotoolbox` present |

Note: `TEST_BASELINE.md` estimated ~367 cases as a lower bound; the measured count is 382.

## Startup and idle (unpackaged `electron dist-electron/main/main.js`, N = 3)

Log shows `[auto-update] Skipping update checks in development.`: no update feed contact in this mode. No errors or warnings in the app logs.

| Run | Renderer appeared | RSS median (IQR), 40 s after a 10 s settle | CPU% median / max | `footprint` total |
|---|---|---|---|---|
| 1 | 10.8 s (first launch, cold) | 144 MB (140-155) | 4.8 / 12.6 | 198 MB |
| 2 | 1.8 s | 200 MB (172-399) | 6.8 / 14.8 | 197 MB |
| 3 | 1.9 s | 396 MB (396-436) | 13.8 / 16.7 | 196 MB |

Median of runs: RSS 200 MB, CPU 6.8%. Variance between runs is large and is kept as-is (outliers not removed); a dev run differs from a packaged build in memory. Idle CPU is **not** ~0% in this mode.

## Not run

B2o recording (screen, screen+camera+mic, system audio), B7o export, B8o transcription (needs approval for the model download), `powermetrics`, packaged-build measurements.

## Existing observations (recorded, not fixed)

- No lint tooling.
- Renderer bundle > 500 kB warning.
- Idle CPU 5-14% in dev mode.
- Source repository volume: `diskutil verifyVolume` reports the APFS volume corrupt (invalid object map, inconsistent space manager). Unrelated to the code baseline but it blocked the planned >= 30 GB environment.

## Cleanliness

After install, build, tests and runs: `git status --porcelain` empty and `git diff 143a0d6` empty in the baseline checkout. No source file was modified. Nothing was committed or pushed; `AUDIT.md` was not touched.

## P0a acceptance

Static baseline and startup: **done**. Acceptance as written (frozen report on a >= 30 GB volume including recording/export/transcription scenarios): **not met**. The owner accepted the reduced baseline as the reference; the unmet items stay documented as open (B2o, B7o, B8o, packaged-build and `powermetrics` measurements).
