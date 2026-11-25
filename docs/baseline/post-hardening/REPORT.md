# P0c — Post-hardening baseline report

- **Target:** `a97a7004c49ef7e1f6b0fb3331355d72e9cf44c7` (P0b-min), branch `feat/p0b-min-fork-identity`.
- **Original reference:** `docs/baseline/original-143a0d6/REPORT.md`, frozen reduced baseline at `143a0d6`.
- **Date:** 2026-11-19.
- **Status:** static baseline and startup completed; the full Revision 4 P0a/P0c acceptance is **not met** because recording, export and transcription scenarios remain open.

## Environment and comparability

| Property | Original baseline | Post-hardening baseline |
|---|---|---|
| Machine | Apple M1, 8 GB | Mac Studio M5 Max, 36 GB |
| macOS | 26.5.2 | 27.2.1 |
| Node / npm | 22.23.1 / 11.x | 22.23.1 / 10.9.8 |
| Electron | 43.0.0 | 43.8.10 |
| Disk | 8–11 GiB free | 719 GiB free |
| Displays | 2560x1600 + 3440x1440 | 3440x1440 only |
| Power / thermal | AC / nominal | AC / no warning |
| Lockfile SHA-256 | `d48378ed…1684f` | `6ab91f37…8a452` |

The hardware, OS, npm minor version and display topology changed. **Performance differences are not attributable to the Electron bump or arm64-only packaging.** This report therefore provides a functional and environmental delta, not an isolated performance attribution. Raw data: `raw/environment.txt`.

## Static checks

| Check | Original | Post-hardening |
|---|---|---|
| `npm ci --no-audit --no-fund` | exit 0; 678 packages; 793 MB; 19 s | exit 0; 678 packages; 791 MB; 11 s |
| Electron binary | present | Electron `install.js` had to be run separately; binary `43.8.10` verified |
| `npm run verify:ffmpeg` | exit 0 | exit 0 |
| `npm run typecheck` | exit 0, 6 s | exit 0, 2 s |
| Lint | no script | no script |
| `vitest run` x3 | 78 files, 382/382 tests x3, 6–10 s | 83 files, 393/393 tests x3, 1–3 s |
| `npm run build` | exit 0; 735 kB chunk warning | exit 0; 735.18 kB chunk warning |
| `npm run test:mcp` | exit 0 | exit 0 |
| VideoToolbox encoders | 3 | 3 |
| Working tree after checks | clean | four untracked evidence/task paths, source changes from T4 |

The five extra test files cover the already-completed P0b hardening. P0c T4 adds `tests/bench.test.ts`; its final suite result is recorded below after the last implementation changes. No source failure was fixed during the baseline: the Electron binary installer is environment setup.

## Startup / idle

Original: unpackaged `electron dist-electron/main/main.js`, N=3, 10 s settle, 40 one-second samples of process-tree RSS. The owner-authorized original harness path `<external bench tools directory>` was absent on this Mac. An equivalent temporary external harness was reconstructed from the frozen methodology; it is not represented as the original tool.

| Run | Renderer appeared | RSS median | CPU median / max | Main-process `footprint` |
|---|---:|---:|---:|---:|
| 1 | 0.546 s | 491.1 MB | 9.3% / 21.2% | 64 MB |
| 2 | 0.298 s | 466.6 MB | 8.0% / 19.7% | 64 MB |
| 3 | 0.296 s | 470.6 MB | 8.4% / 15.5% | 63 MB |

Original results were 10.8/1.8/1.9 s renderer appearance, 144/200/396 MB RSS medians and 197/198/196 MB footprint totals. The footprint figures are not comparable: the new snapshots cover only the main process. Logs contain `[auto-update] Skipping update checks in development.` and macOS `Window move completed without beginning` warnings; no application error was observed. Raw data: `raw/runtime-samples-*.csv`, `raw/startup-run-*.log`, `raw/startup-footprint-*.txt`.

## In-repo harness and cross-validation

T4 adds a development-only `--bench` IPC channel and `npm run bench:startup`:

- The exact `--bench` token is required and `app.isPackaged` disables the channel.
- The preload bridge is gated by an environment flag that the main process overwrites on every launch.
- `bench:snapshot` accepts only the main window's web contents ID and rejects other senders before reading metrics.
- Snapshots aggregate `app.getAppMetrics()` working-set sizes over all app processes.
- The startup script uses a temporary user-data directory, supports the three desktop Electron binary layouts, preflights built assets, validates arguments, and reports failures instead of padding samples.
- Focused tests: 9/9 passed; typecheck, build and a short real smoke passed (`raw/bench-focused-tests.log`).
- A differential launch without `--bench` produced identical stdout, stderr and exit status before/after T4 (`raw/differential-normal-startup.json`). A first failed differential run is preserved as `raw/differential-setup-failure.json`; its cause was a missing renderer build in the comparison worktree.

Cross-validation on `startup-idle`: external median of run medians **470.6 MB** vs in-repo 40-sample median **467.328125 MB**, difference **0.695%**, below the proposed 5% threshold (`raw/cross-validation.json`, pass). This is a method-limited result: one fresh IPC run was compared to the median of three earlier external runs, and Electron working-set is not identical in definition to `ps` RSS. The 467.33 MB value lies inside the external run spread (466.6–491.1 MB).

Independent verification statically confirmed the guard, arithmetic, profile isolation and documentation. Its configured mode blocked its own command execution; the parent performed all applicable runnable checks. Advisory findings were resolved with preflight, portability, argument, empty-metric and naming fixes, plus focused tests.

## Final verification after T4

- `npx vitest run tests/bench.test.ts`: 9/9 passed.
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0; known 735.18 kB renderer chunk warning.
- Short `npm run bench:startup`: 2 samples, no bench errors.
- Final full suite: **84 files, 402/402 tests passed**, exit 0 (`raw/final-tests.log`, `raw/final-tests-summary.txt`).
- Final focused checks after the last type-guard cleanup: 9/9 tests, typecheck and `git diff --check` passed (`raw/bench-final-checks.log`).

## Code delta and isolation

P0b-min compared with the original baseline changes fork identity, disables automatic update downloads, pins Electron 43.8.10, restricts macOS packaging to arm64 with minimum macOS 26.5.2, and ignores `VITE_DEV_SERVER_URL` in packaged builds. P0c adds only the benchmark instrumentation, its tests, script, command and documentation. ACE-Step removal has not landed, so P0b-hygiene is not part of the delta. Isolating the Electron bump from hardware changes and identity/packaging changes would require a controlled A/B run on one machine; that measurement is **not available**.

## Open work / acceptance

The accepted original baseline was itself reduced (static + startup only). The Revision 4 plan additionally names B2o recording, B7o export, B8o transcription, packaged-build measurement, `powermetrics`, `G0-THRESHOLDS`, and the hardware gates. Those remain open. `G0-THRESHOLDS` is an owner decision; `G1-CAPTURE` and `G2-RENDER` require hardware scenarios on the target machine; `G-DIST` additionally requires Apple Developer credentials. Therefore the app roadmap is not complete after P0c.

The internal harness may gate regressions only after this method-limited cross-validation is accepted; it does not replace the hardware gates. Raw evidence is accompanied by `MANIFEST.sha256`; machine serial, hardware UUID, provisioning UDID and owner-specific absolute paths were redacted before freezing.
