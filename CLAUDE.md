Read [AGENTS.md](AGENTS.md) first. It contains the project workflow, guardrails and conventions for
every coding agent, and links to the architecture and product docs.

## Test cadence: a hard rule

**Never run the full e2e suite (`npm run test:e2e` with no file) after a change.** It takes about a minute, and
the owner has said more than once that it must not be rerun "every time". After a change run only:

1. `npx vitest run` (unit tests, a few seconds), and
2. at most the ONE e2e spec the change touches, for example
   `npm run test:e2e -- e2e/controllerLayout.spec.ts`.

`npm run check` and `npm run test:e2e:smoke` are for when you are about to commit a finished piece of work.
The full suite is only for a milestone boundary, a release, or when the owner asks. Do not rerun a test that
already passed on code that has not changed since. See "Definition of done" in AGENTS.md.
