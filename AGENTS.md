# Code Review Rules

Rules used by the pre-commit review (`gga`). They describe conventions this repository already follows.

## TypeScript
- Strict typing; no `any` and no unchecked casts in new code.
- Keep logic that does not need Electron in pure modules so it can be unit tested without mocking `electron`.
- Use `const`/`let`, never `var`.

## Electron security
- Renderer windows keep `contextIsolation` on and `nodeIntegration` off.
- Never load remote or environment-provided URLs in a packaged app.
- No secrets, tokens or personal data in source, tests, logs or fixtures.

## Tests
- Behavior changes ship with a Vitest test (`tests/*.test.ts`) that goes through the public interface.
- A bug fix includes a regression test that fails without the fix.

## Scope and delivery
- One concern per commit, with a Conventional Commit message.
- Changes to update feeds, signing, identity or dependencies are called out in the commit message.
