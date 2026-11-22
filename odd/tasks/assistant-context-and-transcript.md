# Assistant transcript access and chat continuity
Objective: let the in-app AI assistant read a bounded transcript excerpt instead of a 179k-character analysis blob, and keep the conversation thread across turns. Branch `feat/p0b-min-fork-identity`; no PR or merge. Test runner: Vitest, Node 22.

## Specs

- S1 User request (verbatim): "dice che non ha strumenti per leggere il file con l'analisi fatta".
- S2 User request (verbatim): "La chat AI assistent sembra che si perde il filo del discorso, fixalo".
- S3 The assistant must inspect transcript text through an MCP tool that returns timestamped excerpts with a strict limit; it must not need filesystem or shell access.
- S4 A follow-up assistant message must retain the prior user/assistant turns for the same project, and a project switch or explicit reset must clear that context.
- S5 Transcripts, project data and chat history must stay local; no API key, cloud upload or private file access may be introduced.
- S6 Behavior changes ship with Vitest tests through public interfaces; full verification and an ad-hoc rebuild must pass before the app is relaunched.

## Tasks

- [x] T1 (S1, S3, S5) Add a bounded MCP transcript excerpt tool and update assistant prompts/allowlist. Route: inline. Commit `fa30354`.
- [x] T2 (S2, S4, S5) Pass bounded chat history from renderer through IPC into each Claude CLI turn. Route: inline. Commit `88043e8`.
- [x] T3 (S1-S6) Verify, commit in reviewable slices and rebuild/relaunch the app. Route: inline. Final rebuild and launch verified.

## Log

- L1 (user, verbatim): "dice che non ha strumenti per leggere il file con l'analisi fatta".
- L2 (evidence): a live Claude CLI probe with only Open Video Craft MCP tools succeeded on `inspect_project`, then `get_analysis` failed with `Error: result (179,080 characters) exceeds maximum allowed tokens. Output has been saved to ...tool-results/mcp-open-video-craft-get_analysis-...txt`; Bash was denied in `dontAsk` mode, so the assistant could not read the saved file.
- L3 (user, verbatim): "La chat AI assistent sembra che si perde il filo del discorso, fixalo".

- L4 (evidence): live Claude probe with only `query_analysis_transcript` returned `{"status":"complete","totalSegments":413,"returned":1,"excerpts":[{"start":0.72,"end":2.38,"text":"Here we come often with Carmela, I"}]}` without calling `get_analysis`.
- L5 (evidence): live follow-up probe built from `buildClaudeAgentArgs` answered `We just discussed Carmela and evangelical dynamics. I made no edits.`, proving prior turns reached the stateless CLI prompt.
- L6 (decision): the Gemini prompt was left unchanged because its native declaration set does not expose `query_analysis_transcript`; the bounded tool is wired into the provider-neutral MCP server and Claude Max allowlist.
- L7 (evidence): 103 Vitest files / 493 tests passed, typecheck, build, MCP smoke, FFmpeg verification, audit high and `git diff --check` passed before the final app rebuild.

- L8 (evidence): final ad-hoc rebuild at 14:46 produced `release/1.0.6/Open-Video-Craft-1.0.6-mac-arm64.dmg`; the launched app is PID `74609`, frontmost `Open Video Craft`, with window `Open Video Craft`.
- L9 (evidence): a Claude probe against the registered packaged MCP server returned `{"totalSegments":413,"returned":1,"excerpts":[{"start":0.72,"end":2.38,"text":"Here we come often with Carmela, I"}]}`, confirming the fix is inside the shipped bundle.
