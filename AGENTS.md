# Guide for contributors and coding agents

Read this before changing code. It applies to humans and AI agents (Claude, Codex, etc.).

1. Product behavior: [docs/product-design.md](docs/product-design.md) is the source of truth.
2. Code structure: [docs/architecture.md](docs/architecture.md), especially the
   **"Recipe: adding a command end to end"** section.
3. Setup and scripts: [README.md](README.md).

## Workflow (project board)

The backlog is GitHub Project #8 (https://github.com/users/cyaxsoftware/projects/8), columns
`Todo → In Progress → Awaiting Human Review → Done`.

- **Work one card at a time**, starting from the top of `Todo` (the board is ordered by dependency).
  Do not build work that belongs to other cards. If you discover needed work, create a card for it.
- **Move a card to `In Progress` before you start it**, not after.
- Every new card must have **Purpose**, **Description** and **Success criteria** sections.
- When finished: if tests or other automated evidence prove every success criterion, move it to `Done`
  and comment the evidence (commit, commands run, results). If anything needs a person (real hardware,
  visual judgment), move it to `Awaiting Human Review` and say exactly what to check.
- Commit each card separately with `Refs #<issue>` in the message. Work on a branch, not `main`.

```bash
node scripts/board.mjs list
node scripts/board.mjs move 12 In Progress
node scripts/board.mjs add 17 12          # put new issue #17 on the board after #12
```

## Definition of done for any change

- `npm run check` passes (typecheck, lint, format, unit tests). Never disable a rule to get it passing
  without explaining why in the code.
- `npm run test:e2e:smoke` passes if you touched main, preload, windows or the UI. It runs five key
  end-to-end tests tagged `@smoke` (about 15 s with the build). Do not run the full suite on every card.
- `npm run test:e2e` (the full suite, including the layout and acceptance matrices) runs at milestone
  boundaries, before a release, or when asked. **Not after every change, and not on every card**: while
  working, run `npx vitest run` plus only the one e2e spec you touched (for example
  `npm run test:e2e -- e2e/controllerLayout.spec.ts`), and never rerun a test that already passed on
  unchanged code.
- New behavior has tests next to the code (`*.test.ts` / `*.test.tsx`).
- Docs updated if you changed architecture, commands, scripts or user-visible behavior.

## Guardrails (from the product design; do not break these)

- `calledNumbers` is an **ordered array of unique integers 1..75**. Never store calls as a Set, sort
  them, or keep only a count. The last element is the current call.
- Tapping a called ball **removes** it; tapping again **appends** it as newest. **No Undo button**, no
  confirmation on calls.
- **Never assume a free center square.** Patterns highlight only cells the operator selected.
- Don't silently overwrite saved pattern templates during in-game edits.
- **No network**: no HTTP server, CDN, web fonts, remote images or online services. The offline policy
  blocks requests in production; don't weaken it.
- **Main process owns state.** Renderers send commands through `window.bingo` and render snapshots.
  Never add state that a renderer persists itself.
- The Presentation window is **read-only**: no buttons, no command API.
- Never auto-project on startup. Closing the Presentation must not affect the Controller or the game.
- Keep game state separate from presentation mode and timer state.

## Conventions

- TypeScript strict mode, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
  No `any`.
- Respect the import boundaries in docs/architecture.md (lint enforces them).
- Pure logic goes in `src/shared` with unit tests. Electron-specific code stays thin.
- React: function components, CSS Modules, design tokens from `renderer/shared/styles/tokens.css`.
  Components receive data and callbacks as props; only the top-level app touches the store and API.
- Every `BrowserWindow` is created with `createAppWindow()`.
- Validate all IPC arguments in main. Commands return `CommandResult`; never throw across IPC.
- Persisted format changes need a `schemaVersion` bump, a migration and a migration test.
- Comments explain _why_, not _what_.

## Windows-specific notes

- Shell examples in docs use PowerShell. When editing files from PowerShell 5.1, avoid
  `Set-Content -Encoding utf8` / `Out-File -Encoding utf8`: they write a BOM, which breaks JSON config
  parsing (e.g. `.oxlintrc.json`).
- Display ids from Electron are not stable across reconnects; always re-verify before using one.
