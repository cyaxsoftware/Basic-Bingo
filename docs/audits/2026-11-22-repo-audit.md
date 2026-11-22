# Repository audit | Offline Bingo Display

**22 November 2026** · Branch `m1-foundation` · Commit `5f2a025` · Milestone 1

The shared game model, main-process state ownership, and narrow window APIs fit this application well. Both screens derive the same board from one ordered call sequence, and the code can test those rules independently of Electron. The highest priority is preserving a recoverable game when a filesystem operation fails. The next operational risk is a Controller that reports a working projector after its renderer has failed.

## Scope and verification

The review traced a ball tap from the Controller through preload and IPC to storage and both screens, then followed startup recovery, display changes, and shutdown. It also examined build configuration, test entry points, and the contributor documentation. The scope is the implemented milestone. Patterns, media, and timers are scheduled for later milestones.

| Verification on Windows x64 with Node 24.16.0 | Result                                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                               | Typecheck, lint, and formatting passed. All 111 unit and component tests passed across 13 files.                                         |
| `npm run test:e2e`                            | Forge built the Windows package. All three Playwright tests passed against the built application bundles launched from the working tree. |

Physical projector behavior, abrupt power loss, and installer execution remain unverified by this audit. The failure paths below follow from source inspection. The suggested regression cases identify how to verify a fix.

## Patterns worth keeping

- **Share the rules and let each screen own its controls.** Both boards use `buildBoardRows`, and both call summaries use `summarizeCalls`. A correction to history ordering can be made once while the audience and touch interfaces evolve independently. [Board model](../../src/shared/game/boardModel.ts) · [Controller grid](../../src/renderer/controller/components/BallGrid.tsx) · [Audience board](../../src/renderer/presentation/components/AudienceBoard.tsx)
- **Keep one state owner and test delivery order.** The store applies each command synchronously. Each renderer subscribes before fetching its initial snapshot and discards older revisions. A late initial response therefore cannot rewind a call already visible on screen. [App store](../../src/main/state/appStore.ts) · [Snapshot store tests](../../src/renderer/shared/snapshotStore.test.ts)
- **Keep Electron at the edges.** Injecting the persistence interface lets store tests exercise save failures without a disk. The narrower Presentation bridge exposes only snapshot operations, and the IPC tests check the sender independently of the bridge. [Store tests](../../src/main/state/appStore.test.ts) · [Preload bridge](../../src/preload/exposeBridge.ts) · [IPC tests](../../src/main/ipc/registerIpcHandlers.test.ts)

## Recommendations

### 1. High — Preserve the good backup when recovery is incomplete

If the primary file is invalid and moving it aside fails, `load()` can still return a valid backup. The next save unconditionally copies the primary over that backup before replacing the primary. If the final rename also fails, the invalid primary can occupy both recovery paths. The same rotation can overwrite a backup with a primary the loader could not inspect.

**Recommendation.** Track whether the primary is safe to rotate. After fallback, preserve the validated backup and resolve the unreadable primary before replacing it. Test a failed quarantine followed by a save and failed replacement, then restart and verify the original backup still loads. [Repository load and save logic](../../src/main/persistence/stateRepository.ts) · [Existing recovery tests](../../src/main/persistence/stateRepository.test.ts)

### 2. High — Give the operator a recovery choice before quitting with unsaved calls

A failed save sets a visible error while the Controller is open. Closing the Controller destroys that window before shutdown waits for the write queue. The repository's `flush()` resolves even after a failed write, and the three-second timeout resolves like a successful flush. Either path can exit with the newest calls only in memory. The README promises exact restoration after power loss, which an acknowledged but pending write cannot guarantee.

**Recommendation.** Track the latest requested and successfully written revisions of durable state. Handle a close request while the Controller can still show a retry or explicit exit choice. Distinguish failure and timeout from a completed save, and document that sudden loss restores the last completed write. Test a failed final save and a write that exceeds the deadline. [Shutdown](../../src/main/main.ts) · [Repository flush semantics](../../src/main/persistence/stateRepository.test.ts) · [Saved-game documentation](../../README.md#saved-game)

### 3. Medium — Tie projection status to the audience window's lifecycle

`openOnDisplay()` publishes “projecting” before the page finishes loading. Load failures and renderer termination are logged, but neither event clears that status. During display changes, the manager handles a missing target and changed bounds, yet keeps projecting if the target now hosts the Controller. The initial opening check already excludes that display.

**Recommendation.** Publish the active status once the current window is ready. On a main-frame load failure, renderer loss, or a target that now hosts the Controller, close the affected Presentation and show a recoverable notice. Check window identity so an event from a replaced Preview cannot close its successor. Cover these transitions with simulated window and display events. [Window creation](../../src/main/windows/createAppWindow.ts) · [Presentation lifecycle](../../src/main/windows/presentationWindowManager.ts)

### 4. Medium — Exercise the actual release executable

The end-to-end script packages the app, but the harness passes the project root to the development Electron executable. This gives meaningful IPC and restart coverage while leaving packaged-only paths, the ASAR contents, and the configured binary fuses outside the runtime assertions.

**Recommendation.** Add a Windows release smoke test that starts the generated executable in an isolated user profile, opens Preview, and verifies that a call reaches it. Run it alongside the existing checks in a Windows CI job. An ordinary desktop launch can exercise the packaged binary with its production fuses enabled. [Test harness](../../e2e/appHarness.ts) · [Package scripts](../../package.json) · [Forge configuration](../../forge.config.mts)

### 5. Medium — Give each released save format its own game shape

`PersistedStateV1.game` names the live `GameState` interface, while its runtime schema separately defines the V1 fields. Adding a required game field for the next milestone would retroactively change what TypeScript considers a V1 file, making old fixtures and migrations harder to maintain.

**Recommendation.** Define the V1 game fields alongside the V1 schema and convert validated data to the current domain model at load time. Keep a representative V1 file as a migration fixture. This preserves the meaning of an existing save when the game model grows. [Persisted format](../../src/main/persistence/persistedState.ts) · [Game model](../../src/shared/game/gameState.ts)

### 6. Low — Align automated guardrails with the contributor guide

The architecture guide says lint enforces the main-process import boundary. The lint configuration has overrides for shared, preload, and renderer code but none for main. Separately, setup advertises Node 22 or newer, while the locked jsdom package requires Node 22.22.2 or later on the 22.x line, and 24.15.0 or later on 24.x.

**Recommendation.** Add the missing main-process import restriction and check it against a representative forbidden import. Align the package engine range and README with the supported, tested Node versions and run the gates on the lowest advertised version. These changes catch architectural drift during review and make a clean checkout reproducible. [Lint configuration](../../.oxlintrc.json) · [Architecture guide](../architecture.md) · [Package manifest](../../package.json) · [Locked dependencies](../../package-lock.json)

---

**Follow-up (backlog):** finding 1 → #18 · finding 2 → #19 · finding 3 → #20 · finding 6 → #21 · finding 5 → #22 · finding 4 → #23
