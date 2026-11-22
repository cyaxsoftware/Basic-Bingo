# Architecture

This document explains how the app is put together and how to extend it safely. Product behavior is
defined in [product-design.md](product-design.md); this file covers the code.

## Processes

```
Electron main process  (the single source of truth)
 ├─ AppStore ............ canonical state, applies commands, publishes snapshots   src/main/state
 ├─ JsonStateRepository . atomic save/load of the durable subset                    src/main/persistence
 ├─ IPC handlers ........ validated entry points from renderers                      src/main/ipc
 ├─ DisplayManager ...... watches Windows displays                                   src/main/windows
 ├─ PresentationWindowManager .. the one Presentation window (project / preview)     src/main/windows
 └─ offline policy ...... blocks network, popups, navigation, permissions            src/main/security

Controller window   (React)  ── preload: controllerPreload.ts   → window.bingo (commands + reads)
Presentation window (React)  ── preload: presentationPreload.ts → window.bingo (reads only)
```

Both windows run with `contextIsolation: true`, `nodeIntegration: false` and `sandbox: true`. Every
window is created through `createAppWindow()`, which applies these settings and the navigation lock.

## The state flow

```
 tap B-3 in Controller
   → window.bingo.toggleBall(3)                     preload (typed function, no raw IPC)
   → ipcMain 'bingo:toggle-ball'                    sender must be the Controller; arg validated
   → AppStore.dispatch({ type: 'toggleBall', ball })
       → reduceGame()                               shared pure rules
       → new snapshot, revision + 1
       → repository.save()   (async, coalesced)     never blocks the tap
   → registry.broadcast(snapshot)                   'bingo:snapshot-updated' to both windows
   → renderer snapshotStore accepts it if revision is newer
   → React re-renders via useSyncExternalStore
```

Key rules:

- **Renderers never own state.** They send commands and render snapshots.
- **One snapshot type** (`AppSnapshot` in `src/shared/ipc/contract.ts`) goes to every window, with a
  strictly increasing `revision`. Renderers drop anything not newer, so they can never show stale or
  out-of-order state.
- **New windows are never stale:** the renderer subscribes to pushes first, then requests the current
  snapshot (`snapshotStore.ts`).
- **Derived values are computed, not stored.** Current call, previous five, ball letters and board
  statuses come from `src/shared/game` selectors.
- **Game state is separate from display and runtime state.** `snapshot.game` and
  `snapshot.presentationMode` (which view the audience sees; `src/shared/presentation`) are persisted
  but independent: changing the mode never touches the game, and a new game leaves the mode alone.
  `presentation` (window status), `displays` and `notices` are runtime-only. Future timers get their
  own sections rather than being mixed into `game`.
- **Patterns are pure rules in `src/shared/patterns`, applied by one reducer (`reducePatterns`).** The active pattern is a working COPY of a library
  template: selecting and editing change only the copy, and the library changes only on an explicit update or
  save-as-new. Every one of the 25 cells, the center included, is an ordinary editable cell (no free-space
  rule). The module takes `now` and new ids as arguments, so it stays deterministic. It lives outside
  `GameState`, like the presentation mode, so New Game cannot touch it. It is persisted next to the game
  (`patterns` in the V3 file) and exposed as `snapshot.patternLibrary`, `snapshot.activePattern` and
  `snapshot.shownPattern`. `shownPattern` is what the projector renders: a SNAPSHOT of the working pattern's title
  and cells, taken by `showPatternOnProjector` and cleared by `hidePatternOnProjector`. Editing the working copy
  never changes it; only the next push does. The eleven Controller-only commands are `selectPattern`, `setActivePatternCell(index, on)`, `renameActivePattern`,
  `updateSavedPattern`, `saveActivePatternAsNew`, `createPattern`, `renamePattern`, `duplicatePattern` and
  `deletePattern`, `showPatternOnProjector` and `hidePatternOnProjector`. The IPC handlers check argument types; the rules (cell 0 to 24, title 1 to 60 characters,
  exactly 25 cells, known ids) live in the reducer, so they apply to every caller.

## Shared code boundaries

| Folder           | May import                                   | Must not import                    |
| ---------------- | -------------------------------------------- | ---------------------------------- |
| `src/shared`     | other `src/shared` files, `zod`              | Electron, Node, React, other `src` |
| `src/main`       | `src/shared`, Electron, Node                 | `src/renderer`, `src/preload`      |
| `src/preload`    | `src/shared`, `electron` (renderer subset)   | Node built-ins, main, renderer     |
| `src/renderer`   | `src/shared`, React                          | Electron, Node, main, preload      |

These are enforced by `no-restricted-imports` overrides in `.oxlintrc.json` and by separate
TypeScript projects (`tsconfig.node.json` has no DOM types; `tsconfig.web.json` has no Node types).

## The IPC contract

`src/shared/ipc/contract.ts` defines channel names, payload types, `ControllerApi`, `PresentationApi`
and `CommandResult`. Main, preload and renderers all import it, so TypeScript catches drift.

| Channel                     | From         | Purpose                                     |
| --------------------------- | ------------ | ------------------------------------------- |
| `bingo:get-snapshot`        | any window   | current snapshot                            |
| `bingo:toggle-ball`         | Controller   | toggle a ball                               |
| `bingo:show-bingo-banner`   | Controller   | raise the BINGO CALLED banner (idempotent)  |
| `bingo:dismiss-bingo-banner`| Controller   | hide the banner; calls untouched            |
| `bingo:new-game`            | Controller   | clear calls and banner (UI must confirm)    |
| `bingo:set-presentation-mode`| Controller  | choose the audience view                    |
| `bingo:select-pattern` ... `bingo:delete-pattern` | Controller | nine pattern commands (below)    |
| `bingo:list-displays`       | Controller   | re-read displays (also updates snapshot)    |
| `bingo:open-presentation`   | Controller   | fullscreen on a display id                  |
| `bingo:open-preview`        | Controller   | resizable preview window                    |
| `bingo:close-presentation`  | Controller   | close the Presentation window               |
| `bingo:dismiss-notice`      | Controller   | dismiss an operator notice                  |
| `bingo:snapshot-updated`    | main → all   | pushed after every change                   |

Commands return `{ ok: true }` or `{ ok: false, error }` and never throw across IPC. Main checks the
sender's `webContents.id` against `WindowRegistry`: the Presentation window cannot send commands even
if someone modified its page.

## Persistence

`src/main/persistence/`:

- `persistedState.ts`: the on-disk documents (`PersistedStateV1` and `V2` are frozen; `PersistedStateV3` adds
  the pattern library and the active pattern and stays open to M3 changes until M3 ships), zod
  validation, the migration table, and explicit conversion between the current document and
  `AppData` (the durable state the app uses). Documents never reference live domain types such as
  `GameState`, so growing the game model cannot change what an existing file means.
- `fixtures/state-v1.json` / `state-v2.json` / `state-v3.json`: representative files for each version; tests
  load them on every run (an old file must keep loading, migrated up: V1 gets the banner hidden, V2 gets the
  default pattern library and an empty working pattern). Pattern data is checked entry by entry on load: one
  damaged pattern is dropped with a warning, and a missing section restores the defaults, never costing the game.
- `stateRepository.ts`: storage under `%APPDATA%\Offline Bingo Display\bingo-data\`.

Save sequence: write `state.json.tmp` → `fsync` → **re-validate** the current `state.json` and copy it to
`state.json.bak` only if it is valid (an invalid primary is moved aside instead, and the backup is left
alone) → rename the temp file over `state.json` (retrying briefly on Windows file locks). A crash at any
point leaves a complete file, and the backup only ever holds data that was validated at the moment it
was copied, so a damaged primary can never overwrite the last good copy. Saves are serialized and coalesced: rapid taps write only the latest state, and
every caller's promise settles when its state or a newer one is on disk.

Load sequence: `state.json` → `state.json.bak` → defaults. Unreadable files, including files from a
**newer** schema version, are renamed `.unreadable-<timestamp>` and never overwritten. The load result
reports its source, and `main.ts` turns anything other than a clean load into a Controller notice.

A failed save sets `snapshot.persistence` to `error`; the Controller shows it until a save succeeds.

## Displays and the Presentation window

- `DisplayManager` re-reads the full display list (debounced 300 ms) on any `screen` event, because
  Windows emits bursts of transient events on plug/unplug, sleep/resume and scaling changes.
- Labels show the Windows monitor name and physical resolution. `hostsController` marks the display the
  Controller is on; that display is never offered for projecting.
- **Project:** borderless window at the display's bounds, then `setFullScreen(true)` and
  `showInactive()` so keyboard focus stays on the Controller.
- **Preview:** a normal 960×540 window centered on the Controller's display.
- At most one Presentation window exists; opening a new one replaces the old one.
- **Status follows the real window:** `opening` while it loads, then `projecting` / `preview` only on
  `ready-to-show`. A main-frame load failure, a renderer crash, a lost display, or the Controller being
  moved onto the projected display closes the window (never left off-screen or covering the Controller)
  and adds an operator notice. Every handler checks it still belongs to the current window, so late
  events from a replaced window are ignored. If the display's resolution changes, the window is refit.
- The manager receives its window factory from `main.ts`, so `presentationWindowManager.test.ts` drives
  these transitions with fake windows and a fake screen.
- The Controller opens on the built-in (internal) display, falling back to the Windows primary display.

## Lifecycle

- **Single instance:** a second launch focuses the existing Controller and exits.
- **Startup never auto-projects.** The remembered display is only pre-selected in the drop-down.
- **Closing the Presentation** only updates status.
- **Closing the Controller** quits the app, guarded by `src/main/app/closeGuard.ts`: the `close` event
  is intercepted while the window still exists, and `AppStore.settleSaves()` waits up to 2 s for the
  latest save. If it is saved, the app quits. If it failed or timed out, a native dialog offers **Retry
  save**, **Keep app open** or **Quit anyway**. The store numbers save requests, so a failure or timeout
  is never mistaken for success.
- `before-quit` (any quit path) closes the Presentation and waits up to 3 s more for a last save,
  logging the outcome if it is not saved.

## Renderer structure

- `renderer/shared/snapshotStore.ts` + `useSnapshotState.ts`: the latest snapshot as React state.
- `renderer/shared/bingoApi.ts`: the only place that touches `window.bingo`. Apps receive the API and
  store as props, so tests pass `renderer/test/fakeBingoApi.ts`.
- `renderer/controller/useControllerActions.ts`: wraps commands and surfaces failures.
- Components are presentational and styled with CSS Modules. Colors and spacing live in
  `renderer/shared/styles/tokens.css`; each window adds its own theme file (`controller.css`,
  `presentation.css`), so the two views can be restyled independently.
- `BallChip` is sized by the caller's `font-size` only (diameter = 2.6em).
- The projector board sizes itself from its container (`container-type: size`, `cqw`/`cqh`), so it
  fits 16:9 and 4:3 without breakpoints per resolution.

## Recipe: adding a command end to end

Example: `newGame` (added in milestone 2). Touch these files in order:

1. **Rule** — `src/shared/game/gameState.ts`: add `{ type: 'newGame' }` to `GameCommand` and handle it
   in `reduceGame`. The `never` check in the `default` branch fails to compile until you do.
2. **Rule tests** — `src/shared/game/gameState.test.ts`.
3. **Contract** — `src/shared/ipc/contract.ts`: add a channel to `IpcChannel` and a method to
   `ControllerApi`.
4. **Main handler** — `src/main/ipc/registerIpcHandlers.ts`: register it with `command(...)`, validate
   arguments, call `store.dispatch(...)`. Add a test in `registerIpcHandlers.test.ts`.
5. **Preload** — `src/preload/exposeBridge.ts`: add the method to `createControllerApi()`. TypeScript
   reports an error until it matches `ControllerApi`.
6. **Test fake** — `src/renderer/test/fakeBingoApi.ts`: implement the method.
7. **UI** — `src/renderer/controller/useControllerActions.ts` and a component.
8. **E2E test** (if the operator would notice a regression) — `e2e/`.
9. Run `npm run check` and `npm run test:e2e`.

If the command changes **persisted** data, follow the steps at the top of `persistedState.ts`: add a new
document version with its own game shape, a migration from the previous version, updated
`toPersistedState` / `fromPersistedState`, and a fixture for the new version, while the existing
`state-v*.json` tests keep passing. The compiler points at `fromPersistedState` as soon as `GameState`
gains a required field.

## Why these choices

- **Main-process authority + snapshots** rather than per-field events: one source of truth, trivially
  consistent windows, and easy reasoning about ordering (design doc §6).
- **JSON with atomic replace** rather than SQLite: the data is tiny, and a readable file helps support.
  Revisit only if media metadata grows large.
- **oxlint / oxfmt** instead of ESLint / Prettier: the official Electron Forge Vite template's current
  defaults, much faster, with the React hooks rules we need.
- **Two preload scripts** rather than one: least privilege, so the audience window has no command API.
