# Milestone 3 — manual acceptance checklist

Run on the target Windows 11 touchscreen laptop with an external monitor or projector, using the packaged
app (`npm run make` or `npm run package`).

Automated E2E tests cover the logic and layout. This checklist covers what needs real hardware and a human
eye: touch, Windows scaling, a physical projector, and reading the pattern from the back of the room. The M1
and M2 checklists ([M1](manual-acceptance-m1.md), [M2](manual-acceptance-m2.md)) still apply and are not
repeated here.

Tester: ____________ Date: ____________ Build/commit: ____________

## What is automated, and where

Design doc §9 "Patterns" items and the milestone's own behaviour, so nothing is left unchecked by accident.

| Item                                                                         | Automated in                                              |
| ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| Toggle the center square on and off, with correct projector updates          | `acceptance-m3.spec.ts` (Big L keeps the center off...)   |
| Select Big L: the center stays unhighlighted                                 | `acceptance-m3.spec.ts` (same test)                       |
| Rename and edit the active pattern in place while a game is running          | `acceptance-m3.spec.ts` (Renaming and editing...)         |
| Save a new library pattern; it is still there (and in play) after a restart  | `acceptance-m3.spec.ts`, `milestone3.spec.ts`             |
| New Game keeps the pattern, its title and its edits                          | `acceptance-m3.spec.ts`, `milestone3.spec.ts`             |
| Delete asks first; Cancel changes nothing; Confirm keeps the game's pattern  | `acceptance-m3.spec.ts` (Deleting the saved pattern...)   |
| The projector shows the pushed pattern; edits wait for the next push; Hide   | `milestone3.spec.ts` (pushing the pattern...)             |
| Blacked-out rows: numbers vanish on the projector, balls locked, persisted   | `milestone3.spec.ts` (blacking out a row...)              |
| Controller and projector fit at the target sizes, with and without a pattern | `controllerLayout.spec.ts`, `projectorLayout.spec.ts`     |
| Pattern rules: working copy, library, Edited, save, delete, validation       | unit tests (`patternState.test.ts`, `patterns.test.ts`)   |
| Save file recovery: damaged library or pattern never costs the game          | unit tests (`persistedState.test.ts`)                     |
| Touch feel, scaling, projector readability                                   | **Manual: B, C, D, E, F below**                           |
| Restart **without Wi-Fi** (real offline)                                     | **Manual: G below**                                       |

## A. Setup

- [ ] A1. Connect the external display. Press **Win + P → Extend**. Start the app.
- [ ] A2. Tap the **Game Board** tab. Press **Project**. The projector shows the board and the call display, and
      **no pattern yet** (nothing is shown until you push one).

## B. The pattern widget on the Controller (touch)

Repeat at each Windows scaling level (100%, 125%, 150%). Which layout you get depends on the window size:
a left rail on a large window, a strip above the board on a medium one, a small card on the smallest.

- [ ] B1. On a large window (about 1440 × 780 and up) the pattern widget is in the **left rail**, under **New
      Game**: a name field, 25 squares, a saved-pattern choice, **Edit patterns…** and **Show on projector**.
- [ ] B2. The 25 squares are easy to hit with a finger, and each tap turns one on or off at once.
- [ ] B3. Tap the name, type a new name, and press **Enter** (or tap elsewhere). The name changes.
- [ ] B4. Choose a saved pattern from **Saved pattern**. Its squares and name appear. Tap a square: an **Edited**
      flag appears. Tap it back: **Edited** goes away.
- [ ] B5. With a pattern edited, choose a different saved pattern. A question appears (update saved, save as new,
      discard, or keep editing). **Keep editing** changes nothing.
- [ ] B6. On a medium window (about 1141–1439 px wide) the widget is a **strip above the board**; the name, the
      choice, **Edit patterns…** and **Show on projector** are all easy to hit. On the smallest window a small
      **Pattern** card opens the Patterns screen.

## C. Pushing the pattern to the projector

- [ ] C1. Choose **Big L** and press **Show on projector**. The pattern and its title appear on the projector,
      red squares on white, and **the centre square is not lit**.
- [ ] C2. Turn the centre square on in the widget. The projector does **not** change. The button now says
      **Update projector**. Press it: the projector's centre square turns red. Turn it off and update again.
- [ ] C3. Edit the name and a few squares. The projector keeps the old pattern until you press **Update
      projector**.
- [ ] C4. Press **Hide**. The pattern leaves the projector; the board and calls stay.
- [ ] C5. Press **Stop**, then **Project** again. The pattern you last pushed is shown.
- [ ] C6. Tap **Slideshow** and back to **Game Board**. The pattern is still shown.

## D. Reading the projector from the back of the room

- [ ] D1. The pattern's red and white squares and its title are clear from the back of the room, on the real
      projector, in the lighting you will really use.
- [ ] D2. The board's row letters are easy to read, the uncalled numbers are readable but quieter than the called
      ones, and the called balls stand out.
- [ ] D3. The current ball (captioned CURRENT CALL) and the five previous (captioned PREVIOUS CALLS) are large and
      readable.
- [ ] D4. Raise the **BINGO** banner: the board, pattern and call balls stay visible.

## E. The Patterns screen (library tools)

- [ ] E1. Press **Edit patterns…** (or the **Pattern** card). The Patterns screen shows the saved patterns, a
      large editor for this game's pattern, and the title and save buttons. **Back to game** returns, with the
      calls untouched.
- [ ] E2. **Add pattern** makes a blank saved pattern named **New pattern** and switches to it.
- [ ] E3. **Rename** turns the highlighted saved pattern's name into a field. Type a name and press **Enter**.
      An empty name or **Escape** changes nothing.
- [ ] E4. **Duplicate** adds a copy named "… (copy)" right after it.
- [ ] E5. **Delete** asks for confirmation naming the pattern. **Cancel** changes nothing. **Delete Pattern**
      removes it; the pattern in this game stays on screen (and on the projector), now marked as not saved.
- [ ] E6. **Update Saved Pattern** writes your edits to the saved pattern; **Save As New Pattern** keeps them as
      a new one and leaves the original unchanged.

## F. Blacking out rows

- [ ] F1. Tap a row letter (B, I, N, G or O) on the Controller. The row's balls turn into dark discs that cannot
      be tapped, and on the projector **the row's numbers disappear**, leaving a quiet letter.
- [ ] F2. Tap the letter again. The row returns on both screens.
- [ ] F3. Press **New Game**. The blacked-out rows stay blacked out.
- [ ] F4. The letters on the Controller are in their ball colours and easy to hit with a finger.

## G. Restart and offline

Turn Wi-Fi off and unplug the network cable first.

- [ ] G1. Call some balls, choose and edit a pattern, push it to the projector, and black out one row.
- [ ] G2. Close the app and start it again. The calls, the edited pattern, the blacked-out row and the pushed
      pattern on the projector all come back.
- [ ] G3. Create a new saved pattern (**Add pattern**, rename it, edit it, **Update Saved Pattern**). Close and
      reopen: it is still in the saved list.
- [ ] G4. Nothing in the app tries to reach the internet or shows a network error.

## Sign-off

- Open issues found: ____________________________________________
- [ ] No open issues. Milestone 3 accepted.

Signed: ____________ Date: ____________
