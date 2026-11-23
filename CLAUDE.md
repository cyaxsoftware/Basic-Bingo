Read [AGENTS.md](AGENTS.md) first. It contains the project workflow, guardrails and conventions for
every coding agent, and links to the architecture and product docs.

## Tests: do not run the e2e tests (a hard rule)

**Do not run any end-to-end test (`npm run test:e2e`, `npm run test:e2e:smoke`, or a single spec) until a major
milestone is finished, or the owner says the work is done or asks for it.** Each e2e test launches the real app,
so real windows open and close on the owner's screen, which is flashing and gives them a headache. They have
asked for this more than once.

While working, use only the tests that open no windows:

1. `npx vitest run` (unit and component tests, a few seconds).
2. `npm run check` (typecheck, lint, format and the unit tests) when you are about to commit.

If a change really needs a layout or app-level check, say so and ask first instead of running it. Do not rerun a
test that already passed on code that has not changed since. See "Definition of done" in AGENTS.md.
