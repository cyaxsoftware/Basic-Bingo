# Offline Bingo Display
## Product Design Document (PDD)
**Version:** 1.0 draft  
**Target:** Windows 11 touchscreen laptops with an optional external display or projector  
**Primary audience:** Volunteer bingo operators and community organizations, including Legion Posts, VFW Posts, Scouts, and other groups  
**Design principle:** A simple, reliable local game console for operators and a bold, readable show display for players.

---

## 1. Product objective

Create a fully offline, installable Windows application for operating 75-ball bingo. A touchscreen laptop runs the **Controller** and can open an independent **Presentation** window on a second Windows display. The projector shows the 75-number board, winning pattern, call history, and BINGO verification notice, or switches to a break slideshow, a single still image, or a standalone countdown.

No internet connection, cloud database, user account, local HTTP server, or separate companion application is required. The same application owns game state and presents two views of it.

### Success means
- A new operator can start a game, tap called balls, display the pattern, and acknowledge BINGO without a manual.
- Projector output is readable from the back of a hall.
- A dropped internet connection has no effect on operation.
- A relaunch after an unexpected shutdown restores the game and saved content.
- The operator can control both screens without dragging or rearranging browser windows.

## 2. Confirmed product decisions

1. **Ball selection is a toggle.** Tapping an uncalled ball adds it as the newest call. Tapping a called ball removes it from the active called sequence. All other calls retain their relative chronological order. If a removed ball is tapped again, it becomes the newest call.
2. **New Game** clears all called balls but retains the currently selected winning pattern; it requires confirmation.
3. **BINGO CALLED** displays a conspicuous red notice on the game projector, and the notice persists until the operator explicitly dismisses it (false BINGO) or resets the game. It is never automatically dismissed.
4. **Winning patterns** live in a saved, editable library. The active pattern's name and all 25 cells can be edited in place during the game. The projector shows the pattern the operator last **pushed** with the Show on projector button (a snapshot of the title and cells); edits wait for the next push, so a stray tap never changes what the audience sees. **Never assume that the center cell is highlighted.** Patterns only highlight cells explicitly selected by the operator.
5. **Slideshow** supports multiple named collections. Different organizations can maintain their own collections on the same installed laptop.
6. When a break countdown reaches zero, show **“Time to Play!”**, but continue the slideshow until the operator manually chooses another presentation mode.
7. **Still-image mode** uses a reusable local image library; support fit and crop presentation options.
8. Target **Windows 11**. Laptop model is approximately a 15-inch HP touchscreen; exact resolution is unknown. Design and test for multiple logical resolutions and Windows scaling settings.
9. Backup/export/import of settings, patterns, or media is **out of MVP scope**.
10. Provide a polished generic default appearance and limited optional event/organization branding. Avoid an elaborate theme designer in MVP.

## 3. Roles and physical setup

**Operator:** Touchscreen user at the laptop. Selects balls, controls banner, manages patterns, slideshow, and display modes.

**Caller:** Person calling bingo balls aloud. May be distinct from the operator.

**Audience:** Watches the projected screen, typically from some distance.

**Typical setup:** Windows laptop internal touchscreen remains the Controller. Windows desktop is set to **Extend** to a secondary output, which may be a monitor mirrored to a stage projector via the hall's existing AV hardware. Electron identifies displays and launches a borderless Presentation window on the chosen Windows display. A single-screen preview supports rehearsal.

## 4. Experience and screen design

### 4.1 Controller (laptop, touch-first, light interface)

**Visual intent:** Light neutral surfaces, high contrast text, clear color cues, no visual clutter. Optimize for fingers, not mouse hover.

**Primary layout:**
- Compact top bar with app name, presentation status (`Not projecting` / selected display), `Project`, and display selection.
- Presentation mode tabs: **Game Board**, **Break Slideshow**, **Single Image**, **Countdown**.
- In Game Board mode, allocate the largest possible area to an interactive 5-by-15 number layout, grouped into five rows of 15, with B/I/N/G/O row indicators.
- Visible current call, last five *previous* calls, and called-ball count.
- A prominent **BINGO CALLED** button. When the banner is active, show an equally prominent **Dismiss BINGO Banner** control.
- Tapping a row letter blacks that row out (see 5.2a); the letters are drawn in their ball colors.
- Pattern selection, active pattern grid and editable name. Tapping pattern cells edits the active pattern directly. The default UI can use a compact pattern panel that expands for editing, but editing must remain accessible without taking the operator away from the active game screen.
- **New Game** is secondary and confirmation-protected. Do not place it where accidental touch is likely.

**Touch target rule:** Aim for 48 to 60 CSS px number targets at usable layout widths, with a practical minimum of 44 CSS px and visible spacing. At 125% / 150% Windows scaling on a 15-inch display, collapse or rearrange secondary panels before reducing number targets below touch-friendly dimensions. Avoid horizontal scrolling of the 15-number rows; avoid vertical scrolling during normal call operation where possible. Test actual logical pixel width, not just physical screen resolution.

**Ball appearance:** Uncalled numbers have clear contrast. Called numbers are solid B/I/N/G/O color circles. The most recent active call has an extra non-color highlight (e.g., white or dark outline depending on background), not merely a changed fill. A touch produces immediate visual feedback; a call has no confirmation dialog. There is no separate Undo button required for normal corrections.

**Controller pattern workflow:**
1. Operator selects a saved pattern from a library.
2. Its 5x5 grid and title become the active pattern on the Controller.
3. Operator can edit any cell or rename the active pattern inline. The projector is unaffected until the operator pushes it with **Show on projector** (or **Update projector** when it already shows an older version); **Hide** removes it.
4. **Proposed safe behavior:** Maintain an active working copy of the pattern. In-game changes persist as part of current game state, but do not silently overwrite the original library template. Provide **Update Saved Pattern** and **Save As New Pattern** controls. Show an `Edited` indicator while active copy differs from saved template. If the operator changes to another template with unsaved library changes, give an unobtrusive save/discard choice. A generic selected pattern can also be used without saving.
5. Pattern library allows create, rename, duplicate, edit, and delete. Confirm deletion. A library item's grid is 25 explicit booleans; there is no hardcoded center rule or automatic free-space highlighting.

> The working-copy choice above is an implementation proposal, not a separately confirmed user decision. It preserves in-situ editing without accidentally modifying a shared library template. It can be changed during review without altering the main architecture.

### 4.2 Audience projector (dark interface)

**Visual intent:** Large, crisp display, charcoal background, high contrast and saturated BINGO colors. No operator tools, controls, cursors, navigation bars, or visible application chrome.

**Game Board layout:**
- **Layout (16:9):** the 75-number board in a panel across the top, the pushed pattern (graphic and title, no panel) to its left, and a band along the bottom with the large current ball (captioned CURRENT CALL) and the previous five (captioned PREVIOUS CALLS). **Squarer screens (4:3, 5:4):** the board takes the full width at the top, and the pattern sits beside the current and previous calls in the band below it. Nothing is shown in the pattern's place until the operator pushes a pattern; the board then takes the full width.
- **Pattern look:** lit squares are red and the others white, drawn straight on the stage background. Row letters are large text in their row's color; uncalled numbers are plain and quieter than called ones but still readable (about 5:1); called numbers are filled circles.
- 75-number board dominates the display; B/I/N/G/O letterheads and row colors clearly group numbers.
- Uncalled numbers are visible rather than nearly black. Called numbers are filled in their conventional colors: **B blue, I red, N white, G green, O yellow**. Use dark numerals within filled circles for readability, subject to contrast checks.
- The **current call** is shown in a larger ball display, captioned CURRENT CALL, with no extra ring (its size and caption set it apart). On the projected board it is drawn like any other called number.
- **Previous five** shows exactly up to five calls immediately preceding the current active call, newest first. The current ball is not duplicated in previous history.
- When no calls exist, show a calm “Ready for first call” state, rather than a fake or stale number.
- The BINGO banner overlays or occupies a substantial band, reading **BINGO CALLED — PLEASE HOLD YOUR CARDS**. Keep board context visible if possible. Banner stays until dismissed or reset.

**Scaling:** Use proportional sizing to fit 16:9 and 4:3 projections, and test common 1920x1080, 1366x768, 1280x720, and 1024x768 display areas. No essential content should fall off screen. Readability outranks decoration.

### 4.3 Break Slideshow
- Create, rename, and delete **multiple collections** (e.g., Legion Sponsors, VFW Announcements, Scout Fundraiser).
- Import images from local storage; app copies imported files to a managed application media folder so they remain available after the original USB/device is removed.
- Each collection supports image ordering, removal from collection, and a configurable time per slide.
- Images display in sequence and loop until manually stopped. Choose **Fit** (no cropping, may letterbox) or **Fill/Crop** per image or collection; default to Fit for sponsor logos.
- A conspicuous break countdown is visible to the audience, with remaining minutes/seconds. Operator can set duration, start, pause/resume, and reset it. Countdown must be derived from an absolute timestamp while running to avoid drift.
- At zero, replace the timer copy with **Time to Play!** and continue rotating slides. Do **not** automatically switch to the game board.
- Allow the operator to leave slideshow mode and resume it without corrupting game state. For MVP, explicitly define the timer lifecycle in code and UI rather than assuming toggling screen mode should restart it. **Proposed default:** the countdown continues across modes unless paused or reset by the operator; the timer is displayed only in the modes that call for it.
- Handle empty collections gracefully with an operator-facing explanation and a clean presentation placeholder, never a broken image icon.

### 4.4 Single Image
- A distinct presentation mode from a slideshow, using a reusable locally imported image library.
- Show **exactly one selected image indefinitely** until the operator changes it or switches modes. No automatic rotation and no default break countdown overlay.
- **Fit, Fill or Original, per image** (Fit by default, to preserve flags and sponsor logos): Fit shows the whole image with black bars if its shape differs from the screen's; Fill covers the screen and may crop; Original shows the image at its own size, centered (a smaller image is not enlarged, a larger one is shrunk to fit). Each image remembers its own setting.
- The selected image remains available even if the original source file or USB drive is removed after import.
- **Controller:** the Single Image tab replaces the ball board with the image picker (a preview, a Fit / Fill / Original switch for the chosen image, **Add images…** with a file dialog that accepts several files at once, **Remove this image…** with a confirmation, and a thumbnail library; tapping a thumbnail puts that image on the projector). The first image added when none is chosen is shown. With no image chosen, or one whose file is lost, the projector shows a plain "No image selected" / "Image unavailable" screen.
- **The other tabs have the whole window:** New Game, the pattern widget, BINGO CALLED and the Current Call widget appear only on the Game Board tab. A raised BINGO banner is untouched and returns with the board.

### 4.5 Standalone Countdown
- Optionally present a minimal countdown with a configurable simple message, such as “Next Game Begins In…”
- At zero show “Time to Play!” and remain on the screen until manually switched.
- Can share the same timer state as the Break Slideshow, not a second independent running timer.

### 4.6 Projection actions
- **Project:** list Windows displays, choose one, and open a borderless Presentation window on it. Remember selection for convenience but verify it on every launch.
- **Stop Projecting:** close presentation window without closing controller or losing game state.
- **Preview:** open a resizable Presentation window on the laptop even if a second display is unavailable.
- On screen unplug/reconfiguration, the controller keeps working and warns the operator. Do not strand an unmanageable off-screen window; allow selecting a different display or reopening preview.
- Keep operator actions on the laptop; changing presentation modes never resets called balls or the active pattern.
- On application restart, restore operational state but do not automatically launch a full-screen presentation without operator action.

## 5. Game state and interaction semantics

### 5.1 Canonical call sequence

Represent called balls as an **ordered array of unique integers**, `calledNumbers: number[]`, where each number is in 1..75. The last element is the current call. Do not store call history merely as a count or unordered set.

```ts
function toggleBall(calledNumbers: number[], n: number): number[] {
  if (!Number.isInteger(n) || n < 1 || n > 75) throw new Error('Invalid ball');
  return calledNumbers.includes(n)
    ? calledNumbers.filter(x => x !== n)
    : [...calledNumbers, n];
}

const currentCall = calledNumbers.at(-1) ?? null;
const previousFive = calledNumbers.slice(0, -1).slice(-5).reverse();
```

**Examples:**
- Calls `[9, 24, 47, 3]`; tap `24` -> `[9, 47, 3]`. Current remains `3`.
- Tap `3` -> `[9, 47]`. Current becomes `47`; previous history updates accordingly.
- Tap `24` again -> `[9, 47, 24]`. Current becomes `24`, because it is a new call.
- Number 1..15=B, 16..30=I, 31..45=N, 46..60=G, 61..75=O.

The projector must reflect a single canonical state transaction. Both windows receive a revisioned state snapshot, so they cannot disagree about calls or their order.

### 5.2 Reset
- `NEW_GAME` requires an explicit confirmation that identifies what will be cleared.
- Clear `calledNumbers` and `bingoBannerVisible`; retain `activePattern` including title and in-game edits, and the blacked-out rows (5.4a).
- Reset must **not** delete saved patterns or media collections.
- **Proposed default:** leave the selected presentation mode unchanged. If the operator resets during a slideshow, they can manually return to Game Board when ready.

### 5.2a Blacked-out rows
Some games do not use every row. Tapping a row's letter (B, I, N, G or O) on the Controller blacks that row out, and tapping it again brings it back. On the Controller the row's balls become dark discs that **cannot be tapped**; the rules refuse to call or un-call a ball in a blacked-out row, so nothing can be added to a row the game is not using. Calls already made in the row stay as they are, and the row has to be brought back to change them. On the projector the row's numbers **disappear** and only a quiet letter is left. It is a separate game field, `disabledRows`, in B, I, N, G, O order, persisted, surviving a restart, and kept by New Game like the pattern.

### 5.3 BINGO verification banner
- `SHOW_BINGO_BANNER` sets visibility true, idempotently.
- `DISMISS_BINGO_BANNER` sets visibility false, independent of game reset.
- Banner dismissal does not change calls, current call, pattern, mode, or saved data.
- `NEW_GAME` also sets banner false.

### 5.4 Pattern data

```ts
type Pattern = {
  id: string;
  title: string;
  cells: boolean[]; // exactly 25 in row-major order, NO center-cell assumption
  createdAt: string;
  updatedAt: string;
};

type ActivePattern = {
  sourcePatternId: string | null;
  title: string;
  cells: boolean[];
  editedFromLibrary: boolean;
};
```

Patterns are visual instructions only. **Automated detection or validation of winning bingo cards is not part of MVP.** The software displays the requested pattern and the called ball state; humans validate claimed bingo cards.

### 5.5 State ownership and reliability
- The Electron main process owns the canonical state; neither renderer independently persists game rules.
- Commands flow Controller -> typed preload API -> main process validation -> persistence -> updated state broadcasts to Controller and Presentation.
- Persist game and pattern/media metadata in an app-owned, versioned local data directory. Use atomic write / replace semantics for JSON or another simple transactional local approach. The selected storage strategy should guard against partial writes after sudden power loss.
- Store imported media as local files, with metadata containing IDs and relative paths. Never rely solely on original import paths or externally hosted URLs.
- The app should handle malformed state files and missing images with a clear recovery path rather than a blank window. Keep an internal recovery copy or last-known-good state.
- State restoration includes called order, active pattern, banner visibility, named collections, image metadata, and timer configuration. A running timer's target timestamp may expire while app is closed; restore it as expired, not as an arbitrary stale number.
- Serially handle rapid calls to avoid races and persist updates without blocking touch feedback for noticeable intervals.

## 6. Proposed technical architecture

### Stack
- **Electron** on Windows 11
- **React + TypeScript** for Controller and Presentation renderers
- **Vite** development/bundling, with **Electron Forge** packaging
- **Electron `screen` + `BrowserWindow`** for display selection and the presentation window
- **Electron IPC + `contextBridge`** for a narrow, typed API
- **Local JSON storage** initially (versioned state and pattern/media metadata, atomic writes); no SQLite unless use cases genuinely grow
- Local copied image files in the application-managed user data folder

### Processes

```
Electron Main Process (authoritative application state)
   |-- Controller BrowserWindow (touch actions + preview)
   |-- Presentation BrowserWindow (read-only public display)
   |-- State service / command handlers
   |-- Display manager
   |-- Persistence service (local, versioned state)
   `-- Media library and slideshow timer service
```

**Security:** Enable context isolation. Disable Node integration in renderers. Never expose raw `ipcRenderer`, arbitrary filesystem access, or an unrestricted IPC channel to the UI. Build a typed, allow-listed preload bridge for commands and subscriptions. No remote URLs or web fonts are required for operation.

### Suggested commands

```
GET_APP_STATE
TOGGLE_BALL(number)
NEW_GAME()
SHOW_BINGO_BANNER()
DISMISS_BINGO_BANNER()
SELECT_PATTERN(id)
EDIT_ACTIVE_PATTERN_CELL(index, boolean)
RENAME_ACTIVE_PATTERN(title)
SAVE_ACTIVE_PATTERN_TO_LIBRARY(...)
MANAGE_PATTERN_LIBRARY(...)
LIST_DISPLAYS()
OPEN_PRESENTATION(displayId)
OPEN_PREVIEW()
CLOSE_PRESENTATION()
SET_PRESENTATION_MODE(mode)
IMPORT_IMAGES(paths)
MANAGE_COLLECTION(...)
SELECT_SINGLE_IMAGE(imageId)
SET_IMAGE_FIT(mode)
START_TIMER(duration)
PAUSE_TIMER()
RESUME_TIMER()
RESET_TIMER()
```

Consider a single subscribed `APP_STATE_UPDATED` snapshot with monotonically increasing revision IDs, rather than dozens of narrowly overlapping event subscriptions. Derived values (current call, previous five, ball color) should be computed from canonical data.

## 7. Scope

### MVP includes
- Installable Windows 11 application, entirely offline
- Touchscreen 75-ball calling with toggle and chronological semantics
- Current call, previous five, called count, responsive projector board
- Customizable active pattern plus editable named pattern library
- Persistent BINGO verification banner and manual dismissal
- New Game reset with confirmation and retained active pattern
- Second-display projection, preview, and display recovery
- Named slideshow collections, image ordering, slide intervals, countdown
- Reusable still-image library with fit/crop
- Optional standalone countdown
- Limited optional organization/event name and logo (if it does not compromise milestone delivery)
- Local persistence and crash/relaunch recovery

### Not MVP
- Internet/Firebase/cloud sync or user accounts
- Remote phones/tablets as controllers
- Physical bingo-ball machine integration
- Automated bingo-card verification, payouts, or player tracking
- Import/export/backup transfer workflow
- Multi-organization login profiles or permissions
- Online content marketplace, slideshow uploads, or advertising network
- Complex theme designer, animations, sound effects, or analytics
- Automatic software updating

## 8. Phased implementation

### Milestone 1: Foundation and projection proof
- Create the Electron + React + TypeScript + Vite project.
- Open a Controller window and a separate Presentation window on a selected secondary display, or in resizable preview mode.
- Make the main process authoritative for a tiny sample of state.
- From the Controller, toggle a demo ball and see the Presentation update instantly.
- Persist and restore the ordered called ball sequence, without a server or internet.
- Show available displays and handle a missing secondary display.
- Include basic tests, instructions, and documentation.
- **Stop here for review before implementing the full visual design.**

### Milestone 2: Complete game interaction and audience board
- 75-number layout; touch targets; colors; current ball; previous five; called count.
- BINGO banner, dismissal, reset confirmation.
- Responsive, attractive light Controller and dark Projector.
- Tests of correction, history order, and projector recovery.

### Milestone 3: Patterns
- Saved library; select, create, edit, rename, duplicate, delete.
- Live in-situ active pattern editing and explicit library-save behavior.
- Every cell editable, including center; no implicit free space.

### Milestone 4: Presentation media
- Image import and managed storage, named collections, ordering.
- Slideshow, single image, Fit / Fill-Crop, shared countdown, expiry copy.
- Mode switching without affecting game state.

### Milestone 5: Operational hardening and packaging
- Windows installer; offline rehearsal and shutdown/recovery testing.
- Display resolution, scaling, and reconnect scenarios.
- Error states, storage failure warnings, media recovery, accessibility pass.

## 9. Acceptance tests

### Ball calls
- Tap B3 then B9: projector current is B9; previous five begins B3.
- Tap B3 a second time: B3 is not called; B9 remains current; call order intact.
- Tap B3 again: B3 becomes current and is appended to sequence.
- Tap current call: previous active number becomes current; previous-five list updates.
- Call 75 unique numbers with no duplicate entries or stale display state.
- Restart without Wi-Fi: called sequence, current/previous, and edited active pattern recover.

### BINGO and reset
- Show banner: banner stays visible despite other input and screen redraw.
- Dismiss banner: it disappears without modifying called numbers.
- New Game: confirmation appears; cancel leaves everything intact.
- Confirm New Game: called numbers clear, banner clears, active pattern/title remain.

### Patterns
- Toggle center square from off to on and back off, with correct projector updates.
- Select Big L or other pattern with center off: center remains unhighlighted.
- Rename and edit active pattern in place while game is running.
- Save a new library pattern; select it after restart.

### Projection and media
- On Windows Extend, the operator retains Controller on laptop and Presentation occupies external display.
- Unplug projector: Controller remains functional; user can recover screen selection.
- Open preview with one monitor only.
- Import image from USB, remove USB, image still shows locally.
- Slideshow rotates and loops; timer reaches 0 and reads “Time to Play!” while slides continue.
- Single Image stays fixed and does not unexpectedly show countdown.
- Switch modes: calls, active pattern, and BINGO state are unchanged.

### UI and offline operation
- Use a real 15-inch Windows 11 touchscreen with touch gestures, 100%, 125%, and (where practical) 150% scaling.
- Verify the full controller is usable at common logical widths without needing to scroll the number grid horizontally.
- Test a projected 4:3 screen as well as 16:9 from the back of the intended room.
- Disable Wi-Fi and Ethernet before launching, during a session, and through restart: no degradation and no network prompts.

## 10. Design guardrails for Codex

- Do not rebuild the existing Firebase application in place. Treat this as a new offline codebase.
- Preserve the caller's fast number-toggle workflow. Do not add a mandatory `Undo` button.
- Preserve exact chronological semantics and don't store only an unordered called-ball set.
- Don't hardcode center-square free-space behavior.
- Don't silently overwrite saved pattern templates during in-game adjustments.
- Do not use an HTTP server for state synchronization; use Electron's local process bridge.
- Keep game state distinct from presentation mode and timer state.
- Prioritize readability, display recovery, and robust persistence over visual effects.
- Validate each milestone with tests and a human demonstration before continuing.

## 11. Official implementation references

- Electron screen and display management: https://www.electronjs.org/docs/latest/api/screen
- Electron BrowserWindow: https://www.electronjs.org/docs/latest/api/browser-window
- Electron IPC: https://www.electronjs.org/docs/latest/tutorial/ipc
- Electron context isolation: https://www.electronjs.org/docs/latest/tutorial/context-isolation/
- Electron app user data path: https://www.electronjs.org/docs/latest/api/app
- Electron Forge Vite + TypeScript template: https://www.electronforge.io/templates/vite-%2B-typescript

---

**Review note:** This document records all ten confirmed operating decisions. Decisions labeled *proposed* are safe implementation defaults that can be changed during UX review; they are not treated as user-approved requirements.
