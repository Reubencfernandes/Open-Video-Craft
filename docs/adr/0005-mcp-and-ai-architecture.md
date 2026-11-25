# ADR-0005: MCP and AI through one app-owned document authority

- **Status:** Proposed. Conditional on P3.9 and on the P9 background-launch test.
- **Date:** 2026-11-15
- **Deciders:** Project owner
- **Plan reference:** [0000](0000-architecture-roadmap.md) §2h, §8, ADR-7, phase P9

## Context

Today the MCP server and the Gemini agent write `editor.json` directly (revision CAS plus lock file), the renderer learns of changes through `fs.watch`, MCP scope control is category matching that Gemini skips, and launching MCP depends on the `runAsNode` fuse, which lets any local process borrow the app's camera and microphone grants.

## Decision

- **One implementation, one authority.** The shared TypeScript `editor-domain` package is the only code that validates, applies, previews, commits and undoes operations. A main-process `DocumentService` is the only writer of `editor.json`; the renderer is an optimistic replica.
- MCP clients connect through an `mcp-bridge` subcommand of the signed Swift helper, which relays stdio to a Unix domain socket (mode 0600, per-launch token). The bridge contains no domain logic. This allows `runAsNode:false`.
- **No offline read path and no offline mutation path.** App not running → `APP_NOT_RUNNING`, or an opt-in background launch (`ai.allowBackgroundLaunch`, default off).
- Mutations are proposals created and persisted by the app only: `create_proposal → add_operations → preview_proposal → commit_proposal`, each commit one undo entry with an actor. Destructive operations and export always need in-app approval. No filesystem paths, shell or network fetch through MCP.
- Times in the public API are `…Sec` (ADR-0004).

## Conditions

- Background launch must be verified clean (no focus steal, single-instance lock respected, acceptable start time and memory); otherwise only `APP_NOT_RUNNING`.
- Until the `ai.gateway` flag flips, the legacy write path remains; the two never run at once.

## Consequences

- Single-writer correctness, uniform scope enforcement, and a real approval flow.
- Behavior change: MCP read resources no longer work while the app is closed (intentional).
