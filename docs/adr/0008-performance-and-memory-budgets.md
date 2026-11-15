# ADR-0008: Measured baselines, memory definitions and budgets

- **Status:** Proposed. All numeric budgets are proposals [P] until the original baseline (P0a) exists.
- **Date:** 2026-11-15
- **Deciders:** Project owner
- **Plan reference:** [0000](0000-architecture-roadmap.md) §2f, §2j, §5, phase P0

## Context

No benchmark, test run or typecheck has been executed for `143a0d6`; every performance statement so far is static analysis or arithmetic. The target is an 8 GB M1, where memory pressure and swap matter.

## Decision

- **Baseline order is a hard rule.** P0a measures the untouched repository in an isolated detached worktree with external tooling only; its results are frozen in `docs/baseline/original-143a0d6/`. P0b hardens (identity, dependencies, removals). P0c re-measures into `docs/baseline/post-hardening/`. Later phases compare against both.
- **Memory is defined, not guessed.** RSS is diagnostic only. The primary budget metric is **physical footprint** (`footprint`); shared GPU/IOSurface memory is reported as its own line and counted once; system gates are `memory_pressure` level and swap growth.
- **Budgets at three levels** (plan §2f): per process (for example helper ≤ 350 MB, editor renderer ≤ 700 MB, export renderer + GPU ≤ 1.5 GB), whole application (recording ≤ 2.0 GB, editing ≤ 2.5 GB, export ≤ 3.0 GB), and system (pressure normal, swap delta ≤ 100 MB, slope ≤ 5 MB per 10 min). A result that cites only RSS is rejected.
- A two-tier harness: external-only for the original repository; an in-repository `--bench` harness added in P0c and cross-validated against the external one within 5%.

## Conditions

- P0a needs enough free disk (≥ 30 GB [P]) and a system volume that is not nearly full, because swap lives there; installing Node 22, `npm ci` (FFmpeg download) and any model download need explicit approval.
- Budgets are recalibrated against the original baseline.

## Consequences

Comparable numbers across phases, with the hardening effect isolated. Cost: P0a precedes every code change.
