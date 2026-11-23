# Milestone 2 — manual acceptance checklist

Run on the target Windows 11 touchscreen laptop with an external monitor or projector, using the packaged
app (`npm run make` or `npm run package`).

Automated E2E tests (`npm run test:e2e`) cover the logic and layout. This checklist covers what needs real
hardware: touch, Windows scaling, a physical projector, and being offline. The M1 checklist
([manual-acceptance-m1.md](manual-acceptance-m1.md)) still applies and is not repeated here.

Tester: ____________  Date: ____________  Build/commit: ____________

## What is automated, and where

Design doc §9 items, so nothing is left unchecked by accident.

| §9 item                                                           | Automated in                                          |
| ----------------------------------------------------------------- | ----------------------------------------------------- |
| Tap B3 then B9: current B9, previous begins B3                    | `acceptance-m2.spec.ts` (Ball calls: B3 then B9)      |
| Tap B3 a second time: not called, B9 current, order intact        | `acceptance-m2.spec.ts` (same test)                   |
| Tap B3 again: B3 becomes current and is appended                  | `acceptance-m2.spec.ts` (same test)                   |
| Tap the current call: previous becomes current, list updates      | `acceptance-m2.spec.ts` (same test)                   |
| 75 unique calls, no duplicates or stale state                     | `acceptance-m2.spec.ts` (75 unique calls)             |
| Restart: called sequence and current/previous recover             | `milestone1.spec.ts`, `acceptance-m2.spec.ts` (BINGO) |
| Show banner: stays visible despite other input and redraw         | `milestone2.spec.ts`, `acceptance-m2.spec.ts`         |
| Dismiss banner: disappears, calls unchanged                       | `milestone2.spec.ts`                                  |
| New Game: confirmation appears; Cancel leaves everything intact   | `milestone2.spec.ts`, `acceptance-m2.spec.ts`         |
| Confirm New Game: calls and banner clear (projector too)          | `milestone2.spec.ts`, `acceptance-m2.spec.ts`         |
| Close and reopen Preview mid-game shows the current state         | `acceptance-m2.spec.ts` (Projector recovery)          |
| Switching modes leaves calls and banner unchanged                 | `milestone2.spec.ts`                                  |
| Controller and projector fit at the target sizes                  | `controllerLayout.spec.ts`, `projectorLayout.spec.ts` |
| Numeral contrast on every ball colour                             | `tokens.test.ts`                                      |
| Restart **without Wi-Fi** (real offline)                          | **Manual: F below**                                   |
| Restart recovers the **edited active pattern**                    | `acceptance-m3.spec.ts`, `milestone3.spec.ts` (M3)    |
| Touch feel, scaling, projector readability                        | **Manual: B, C, D, E, G below**                       |

## A. Setup

- [ ] A1. Connect the external display. Press **Win + P → Extend**. Start the app.
- [ ] A2. Tap the **Game Board** tab (the app remembers the last mode, so it may open on another one). Press
      **Project**. The projector shows the board.

## B. Touch calling at 100%, 125% and 150% scaling

Repeat at each scaling level (Windows Settings → System → Display → Scale), then sign out and in if Windows asks.

- [ ] B1. All 75 numbers are visible on the Controller without scrolling, and the number rows do not scroll sideways.
- [ ] B2. Call a number with a finger. It responds at once (the small press shrink is visible) and is easy to hit
      without touching its neighbour. Try numbers at the edges (1, 15, 61, 75).
- [ ] B3. With six or more calls, the current call, previous five and count are all readable on the Controller.
- [ ] B4. The **BINGO CALLED** button and the four mode tabs are easy to hit with a finger.
- [ ] B5. Pinch or double-tap does not zoom the page.

## C. Mode tabs

- [ ] C1. Tap **Slideshow**. The tab shows as selected; the projector shows a "Coming soon" screen; your calls
      are still listed in the summary.
- [ ] C2. Tap **Game Board**. The same game returns on the projector, calls unchanged.
- [ ] C3. Tap **Single Image** and **Countdown** the same way. Quit and reopen the app: the tab you left selected is
      still selected.

## D. BINGO banner on the real projector

- [ ] D1. Tap **BINGO CALLED**. The red band **BINGO CALLED — PLEASE HOLD YOUR CARDS** appears on the projector and
      the button becomes **Dismiss BINGO Banner**.
- [ ] D2. From the back of the room, the band is readable and the board and current ball are still visible.
- [ ] D3. Keep calling numbers. The banner stays up.
- [ ] D4. Press **Stop**, then **Project** again. The banner is still there.
- [ ] D5. Tap **Dismiss BINGO Banner**. The band disappears; no call changed.

## E. New Game

- [ ] E1. Call several numbers and raise the banner. Tap **New Game**. The dialog says what will be cleared and what
      is kept. Nothing has changed yet.
- [ ] E2. Tap **Cancel**. Everything is as it was.
- [ ] E3. Open **New Game** again and tap **Start New Game**. Calls and banner clear on the Controller and on the
      projector, which shows **Ready for first call**.
- [ ] E4. **New Game** is out of the way: you cannot reach it by accident while tapping numbers.

## F. Restart without a network

- [ ] F1. Call several numbers (note the order) and raise the banner. Turn off Wi-Fi and unplug Ethernet.
- [ ] F2. Close the Controller window. Start the app again.
- [ ] F3. The calls are in the same order, the banner is still up, and nothing is projected until you press **Project**.

## G. Projector resolutions

Set the external display to each resolution in turn (Settings → System → Display) and press **Project** each time.

- [ ] G1. 1920×1080, 1366×768, 1280×720 and 1024×768: the board, current ball, previous five and banner are all fully
      on screen, nothing is cut off, and the numbers are readable from the back.
