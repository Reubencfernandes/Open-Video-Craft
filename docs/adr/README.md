# Architecture decision records

| ADR | Title | Status |
|---|---|---|
| [0000](0000-architecture-roadmap.md) | Architecture and implementation roadmap (full plan, Revision 2) | Proposed |
| [0001](0001-native-capture.md) | Native macOS capture through a standalone Swift helper | Proposed, gated by P1, G-SIGN, G-TCC |
| [0002](0002-rendering-parity.md) | Shared scene evaluator and single GPU compositor | Proposed, gated by R-PoC |
| [0003](0003-editor-domain-v3.md) | Editor domain v3 as the single mutation path (slices P3.0–P3.11) | Proposed |
| [0004](0004-time-model.md) | Time model: flick ticks with explicit conversion boundaries | Proposed |
| [0005](0005-mcp-and-ai-architecture.md) | MCP and AI through one app-owned document authority | Proposed, gated by P3.9 |
| [0006](0006-audio-pipeline.md) | One `AudioMixPlan` for preview, export and analysis | Proposed |
| [0007](0007-distribution-and-licensing.md) | Distribution, fork identity and licensing | Proposed, needs legal review |
| [0008](0008-performance-and-memory-budgets.md) | Measured baselines, memory definitions and budgets | Proposed |

The still-conditional decisions and their gates are listed in section 13 of ADR-0000. Statuses change to Accepted only when the named gate produces measured evidence, recorded in the ADR itself.
