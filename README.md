# Offline Bingo Display

A fully offline Windows 11 desktop app for running 75-ball bingo. A touchscreen laptop runs the
**Controller**; a separate **Presentation** window shows the board to the audience on a second display
(projector or monitor). No internet, cloud service, account or local web server is involved.

> **Status: Milestone 1 — foundation and projection proof.** Ball calling, the two windows, display
> selection and persistence work. Visual polish, BINGO banner, patterns and slideshows come in later
> milestones (see [What is deferred](#what-is-deferred)).

- Product requirements: [docs/product-design.md](docs/product-design.md)
- Milestone 1 brief: [docs/milestone-1-brief.md](docs/milestone-1-brief.md)
- How the code fits together: [docs/architecture.md](docs/architecture.md)
- Contributor and AI-agent guide: [AGENTS.md](AGENTS.md)
- Backlog: [GitHub Project "Bingo-2026"](https://github.com/users/cyaxsoftware/projects/8)

## Requirements

- Windows 11 (development also works on macOS/Linux, but the target is Windows)
- Node.js **22.22.2+ (22.x)**, **24.15.0+ (24.x)**, or **26+**, with npm. Odd-numbered releases are not
  supported by the test tooling. Tested on 22.22.2 and 24.16.0. The range matches `engines` in
  `package.json`, which follows the strictest locked dependency (jsdom).
- Git

## Setup

```powershell
git clone https://github.com/cyaxsoftware/bingo-2026.git
cd bingo-2026
npm install
npm start
```

`npm start` opens the Controller window, maximized, on the laptop's built-in screen.

## Scripts

| Command                 | What it does                                                                 |
| ----------------------- | ---------------------------------------------------------------------------- |
| `npm start`             | Run the app in development with hot reload                                   |
| `npm run check`         | **All quality gates:** typecheck, lint, format check, unit/component tests   |
| `npm run typecheck`     | TypeScript, checked separately for main-process and renderer code            |
| `npm run lint`          | oxlint, including import-boundary rules between processes                    |
| `npm run format`        | Format with oxfmt (`format:check` to verify only)                            |
| `npm test`              | Unit and component tests (Vitest)                                            |
| `npm run test:e2e`      | Builds the app, then drives the real Electron app with Playwright            |
| `npm run test:coverage` | Unit tests with a coverage report in `coverage/`                             |
| `npm run package`       | Build an unpacked app in `out/`                                              |
| `npm run make`          | Build Windows distributables (Squirrel `Setup.exe` and a ZIP) in `out/make/` |

## Using the app

### Calling balls

Tap a number on the Controller to call it. Tap a called number again to remove it (a correction), and
every other call keeps its order. Tap it once more and it becomes the newest call. There is no Undo
button and no confirmation.

The Controller shows the **current call**, the **previous five** calls (newest first) and the called
count. The current call has a dark ring around it on the grid.

### BINGO called and starting a new game

- **BINGO CALLED** (under the call summary) raises the BINGO verification banner. While it is up, the same
  button becomes **Dismiss BINGO Banner**. The banner never hides on its own, and dismissing it does not
  change any call. Keep calling balls while it is up if you need to.
- **New Game** (top right, away from the ball grid) asks for confirmation first. The dialog states what
  will be cleared: **all called numbers and the BINGO banner**. It keeps the winning pattern, saved
  patterns and images, and the selected presentation mode. Cancel (focused by default) and Escape both
  leave everything as it was.

On the projector the banner is a red band reading **BINGO CALLED — PLEASE HOLD YOUR CARDS** above the
board, which stays fully visible. It shows in Game Board view only; switching to another mode and back
brings it back, and it survives closing and reopening the Presentation window.

### Putting Windows in Extend mode

The projector must be a separate desktop, not a mirror of the laptop screen:

1. Connect the projector or monitor.
2. Press **Win + P** and choose **Extend**,
   or open **Settings → System → Display** and choose **Extend these displays**.
3. In the Controller, press **Refresh displays** if the new display is not listed yet.

### Project, Preview and Stop

- **Project:** choose the display in the drop-down and press **Project**. The Presentation window opens
  borderless and fullscreen on that display; the Controller stays on the laptop. The display showing the
  Controller is never offered, so the projector window cannot cover the operator's screen.
- **Preview:** opens the Presentation in a normal, resizable window on the laptop. Use it to rehearse
  with a single screen.
- **Stop:** closes the Presentation window. The game is not affected.

If the projector is unplugged while projecting, the Presentation window closes, the game is kept, and
the Controller shows a warning. Choose another display or open Preview.

The app remembers the last display you projected to and pre-selects it, but it **never starts
projecting on its own**, including after a restart.

### Saved game

Every change is saved immediately to:

```
%APPDATA%\Offline Bingo Display\bingo-data\state.json
```

alongside `state.json.bak` (the previous good save).

- **Quitting normally** restores the exact called sequence. If the latest calls are not saved yet
  (the last save failed or the disk is very slow), closing the Controller asks whether to **Retry save**,
  **Keep app open** or **Quit anyway**, so calls are never dropped silently.
- **After a crash or sudden power loss**, the app restores the **last completed save**. Saves take
  milliseconds, so this is normally every call; only a tap made in the instant before the failure can be
  missing.
- If the save file is damaged, the app loads the backup and tells the operator; damaged files are renamed
  `state.json.unreadable-<time>` rather than deleted.
- If a save fails (for example, the disk is full) the Controller shows a red warning until a save
  succeeds.

## Testing fully offline

The app never needs the network. In production builds every non-local request is blocked, so a hidden
online dependency would fail loudly rather than quietly at a venue.

1. Run `npm run make` (or `npm run package`) while online; this is the only step that needs a network.
2. Turn off Wi-Fi and unplug Ethernet (or enable Airplane mode).
3. Start the packaged app from `out\Offline Bingo Display-win32-x64\offline-bingo-display.exe`, or install
   `out\make\squirrel.windows\x64\OfflineBingoDisplaySetup.exe`.
4. Call balls, Preview/Project, quit, reopen: everything works and the game is restored.

`npm start` (development) also runs offline once `npm install` has completed; it uses a local Vite dev
server on `localhost` only.

The full dual-display checklist is in [docs/manual-acceptance-m1.md](docs/manual-acceptance-m1.md).

## Automated tests

- **Unit and component tests** (`npm test`) live next to the code as `*.test.ts(x)`: game rules,
  persistence and recovery, the store, IPC validation, display selection, and the React views.
- **End-to-end tests** (`npm run test:e2e`) launch the real app with Playwright: Controller → Preview
  sync, toggle ordering, restart persistence, renderer sandboxing, the read-only Presentation bridge,
  and the single-instance lock. Each run uses a throwaway data folder (`BINGO_USER_DATA_DIR`, honored
  only in unpackaged builds), so tests never touch a real saved game.
- Projection onto a physical second display can only be checked by hand (see the manual checklist).

## Project layout

```
src/
  shared/        Pure TypeScript used by every process (game rules, IPC contract, display helpers)
  main/          Electron main process: state store, persistence, IPC, windows, security
  preload/       contextBridge scripts exposing window.bingo (one per window role)
  renderer/
    controller/    Operator window (React)
    presentation/  Audience window (React, read-only)
    shared/        Snapshot store, bridge access, shared components and design tokens
e2e/             Playwright tests against the real app
scripts/         Developer utilities (project board helper)
docs/            Product design, milestone brief, architecture, acceptance checklists
```

## What is deferred

Deliberately **not** in milestone 1 (see [docs/product-design.md §8](docs/product-design.md)):

- Final touch-first Controller and projector visual design; responsive tuning for 125% / 150% scaling (M2)
- The presentation-mode tabs on the Controller (M2; the BINGO and New Game controls and the projector banner
  are in)
- Winning patterns and the pattern library (M3)
- Image import, slideshows, single image, countdown timer (M4)
- Installer polish (icon, signing), accessibility pass, extended recovery testing (M5)

## Packaging notes

`npm run make` builds a per-user Squirrel installer (no admin rights) and a portable ZIP. The installer
is unsigned, so Windows SmartScreen will warn on first run; code signing is planned for M5.
