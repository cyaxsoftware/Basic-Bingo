# Codex Prompt: Offline Bingo Desktop Application, Milestone 1

You are the lead software engineer for a new Windows 11 desktop application: **Offline Bingo Display**.

Read `offline-bingo-product-design.md` in this repository before changing or creating code. It is the source of truth for product behavior and the longer-term architecture. **This assignment is milestone 1 only**. Do not attempt to implement the complete product in one pass.

## Mission for this iteration

Build a proof of architecture that demonstrates a touch-friendly Controller window communicating with a separate Presentation window on the second Windows monitor, **without Firebase, a local HTTP server, or internet access**. The canonical game state must live in Electron's main process, and a tiny sample of it must persist across a full application restart.

### Stack
- Electron
- React + TypeScript (Controller and Presentation)
- Vite
- Electron Forge, with a sensible Windows 11 packaging configuration
- Local persistent JSON in a versioned, app-owned directory under `app.getPath('userData')`, using safe atomic writes/replacements and a recovery strategy
- Electron IPC through a narrow, typed preload bridge with context isolation enabled and Node integration disabled in renderers

Use maintained, compatible package versions. Explain any deviation from this stack rather than silently substituting a technology.

## Deliverables for milestone 1

1. **Working project scaffold** with scripts for local development, production build, typecheck, tests, and (if feasible from the current host OS) Windows distributable packaging. Don't falsely claim a Windows installer was tested if not run on Windows.
2. **Controller window** that opens when the application starts. It includes:
   - A simple 75-ball grid grouped B / I / N / G / O. It can be stylistically minimal for this milestone.
   - Touch/click toggling of called ball numbers with a clear active/inactive state.
   - A compact display of current call and previous five active calls.
   - A button or selector to choose a detected display and open/close the Presentation window.
   - A **Preview** action usable without a second monitor.
   - Live status indicating whether a Presentation window exists and which display it is using.
3. **Presentation window** that:
   - Opens borderless/fullscreen on a chosen nonprimary display, or as a normal resizable window in Preview mode.
   - Reads the same authoritative game state and immediately updates when a ball is tapped.
   - Shows enough of the numbered board/current call/history to verify IPC and synchronization.
   - Has no game-editing controls; its role is read-only output.
4. **Authoritative state service in the Electron main process**. Use an ordered unique array, `calledNumbers: number[]`, not just a set.
5. **Persistent state** restored on application restart, including the exact chronological called-ball sequence.
6. **Basic tests** covering ordered toggle logic and derived current/previous calls, plus a practical manual acceptance checklist for dual-display behavior.
7. **README** explaining setup, how to put Windows in Extend mode, how to launch Controller/Preview/Projector, how to test completely offline, and what is deliberately deferred until later milestones.

## Required ball interaction semantics

The operator uses a touchscreen. There is no requirement for a separate Undo button.

- Tap an uncalled ball to append it as the newest active call.
- Tap a called ball to remove it, preserving the relative order of all remaining active calls.
- Tap that removed ball later to append it again as the newest call.
- The current call is the final element in the active array, or null if empty.
- Previous five are the up to five active calls preceding current, ordered newest-first.
- Only integers 1 through 75 are accepted. Invalid and duplicate states must be rejected or normalized safely.

Sample for tests:

```
[] -> tap 3 -> [3]
[3] -> tap 9 -> [3,9]
[3,9] -> tap 17 -> [3,9,17]
[3,9,17] -> tap 9 -> [3,17] (current 17, previous [3])
[3,17] -> tap 9 -> [3,17,9] (current 9, previous [17,3])
[3,17,9] -> tap 9 -> [3,17] (current 17)
```

## IPC and rendering requirements

- Main process handles commands. Renderer components must not directly mutate persistent state.
- Expose a **typed and allow-listed** preload API such as `getState()`, `toggleBall(number)`, `listDisplays()`, `openPresentation(displayId)`, `openPreview()`, `closePresentation()`, and `subscribeToState(callback)`.
- Publish a fresh state snapshot after each accepted operation; include a monotonically increasing state revision so renderers can ignore stale snapshots.
- Ensure new Presentation windows get the latest state immediately on load, not only after the next call.
- Do not expose raw Electron APIs or arbitrary Node/filesystem access through `window`.
- Do not depend on Google Fonts, external images, remote CSS, CDN JS, online auth, or a running web server in the packaged runtime.

## Windows and display behavior

- Use Electron `screen` and `BrowserWindow` to enumerate and select actual Windows displays.
- The Controller must remain on the laptop when Project opens on the selected external display.
- Handle a missing second display by permitting Preview rather than failing.
- If an external display disappears while projecting, don't crash or lose game state. Notify the Controller and allow selecting another display or reopening Preview.
- Closing the Presentation window must not close or reset the Controller. Closing Controller may exit the application after flushing persistence.
- On restart, restore game state but **do not automatically project fullscreen** without operator action.

## UI for this first milestone

Keep it functional and clearly laid out, not elaborate. A polished projector and touch-first controller design come in milestone 2. Still design the state/API boundaries so those views can be restyled independently.

Use B/I/N/G/O standard grouping and colors (B blue, I red, N white, G green, O yellow), ensuring white `N` calls remain visible on light backgrounds. Number circles and buttons should be large enough to demonstrate touch interaction. Do not hardcode center-square behavior; patterns are outside this milestone.

## Data and code quality

- Prefer small, independently testable modules: `gameState`, `stateRepository`, `displayManager`, `ipcHandlers`, `preload`, `Controller`, `Presentation`.
- Use a versioned state shape to support future additions: active pattern, banner visibility, media collections, slideshow state, etc.
- Store app-owned data in a dedicated subdirectory under `app.getPath('userData')`, not mixed with Chromium cache files.
- Consider writing to a temp file then atomically replacing, preserving a last-known-good version. Document behavior if a write fails; do not silently claim state was saved.
- Guard against duplicate IPC handlers, app reentrancy, multiple conflicting app instances, and Windows display reconnection bugs.
- Add clean typings, useful error messages, and concise comments where architecture is nonobvious.

## Definition of Done

I can run the app on Windows 11, click/tap B-3 on the laptop, and see B-3 appear immediately in the separate Presentation window. I can call two more numbers, toggle an earlier one off without disrupting the remaining order, toggle it back on as the newest, quit the application, reopen it offline, and observe the preserved ordered game state. Project opens on the selected secondary monitor; Preview works on a single monitor.

## Working method and stopping point

1. Inspect the current repo. If it already has files, preserve existing work and report relevant findings before substantial modification.
2. Make a concise implementation plan for this milestone.
3. Implement the milestone, run checks/tests available in your environment, and address failures.
4. Report created/modified files, exact run commands, test outcomes, and anything that must be verified manually on Windows 11.
5. **STOP when milestone 1 meets the definition of done.** Do not proceed to full pattern editing, slideshow collections, BINGO banner, final UI design, installer polish, or future milestones until I review this foundation.

If an implementation detail is ambiguous, choose a conservative, maintainable default consistent with the design document and document it instead of expanding scope.
