# P0b-min — fork identity, update isolation, pinned Electron

Objective: make the fork buildable under its own identity with no path to upstream's update feed. Branch `feat/p0b-min-fork-identity` (from `docs/architecture-rev4` @ `ba9c144`). Delivery: `ask-on-risk`; no push. Test runner: `npx vitest run` under Node 22; also `npm run typecheck`, `npm run build`, `npm run test:mcp`. Mirror: Engram project is ambiguous (`open-video-craft` vs `openvideocraft`), **mirror pending**.

## Specs

- S1 Identity: appId `dev.micio86dev.openvideocraft`; productName stays "Open Video Craft"; `build.publish` and `repository.url` point to `micio86dev/openvideocraft`. (IMPLEMENTATION_PLAN §P0b-min: "new appId/productName/`publish`/Team ID")
- S2 No upstream Team ID: `scripts/verify-mac-release.mjs` and `.github/workflows/release.yml` must not carry upstream's Team ID; signing stays ad-hoc/development. User: "la app è solo per me per ora, non pago lo storie di apple".
- S3 Update isolation: "`autoDownload` off until the fork feed exists" (`src/main/auto-updates.ts`); acceptance "no packaged build contacts upstream's feed".
- S4 Electron: "bump Electron to the version intended for the product (>= 43.8.1 or current) and record the pinned version"; pinned in the lockfile and recorded in `ADR.md` ADR-4.
- S5 "arm64-only `mac.target.arch`, `mac.minimumSystemVersion`" (minimum = lowest tested version: only macOS 26.5.2 was tested; assumption, revisable).
- S6 "gate `VITE_DEV_SERVER_URL` on `!app.isPackaged`".
- S7 Rollback: "identity and Electron bump are separate commits, reverted independently."

## Tasks

- [ ] T1 (S1, S2, S3) identity + update isolation. Route: inline. Commit: pending
- [ ] T2 (S5, S6) arm64-only, minimum macOS, dev-server URL gate. Route: inline. Commit: pending
- [ ] T3 (S4, S7) Electron 43.8.10 pin + ADR-4 record. Route: inline. Commit: pending

## Log

- L1 (2026-11-15, user, verbatim): "Si" (start P0b-min) and "Si la app è solo per me per ora, non pago lo storie di apple" (accepting defaults: appId `dev.micio86dev.openvideocraft`, productName unchanged, publish → `micio86dev/openvideocraft`).
- L2 Route declaration: all tasks inline (no writer trigger: sequential small units sharing `package.json`).
