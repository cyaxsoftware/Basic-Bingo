# #47 — Accessibility manual acceptance checklist

Use the packaged Basic Bingo app on the target Windows 11 laptop. Connect a second display and use
**Win + P**, then **Extend**. Use a test profile or disposable game history. Keep the mouse and
touchscreen idle. If available, repeat the announcement checks with Narrator or NVDA.

Tester: ____________ Date: ____________ Build/commit: ____________

## What is automated, and where

| Item | Coverage |
| --- | --- |
| Serious and critical axe findings in the main Controller and Presentation states | `src/renderer/test/accessibility.test.tsx` |
| The axe gate catches a control with a missing accessible name | Theme switch mutation in the same test |
| Browser contrast in both Controller themes and on the projector | Headless Chromium preview audit |
| Contrast and serious/critical axe findings in real Electron windows | `e2e/accessibility.spec.ts`, pending an authorized run |
| Announcement clarity, visible focus in context, keyboard workflows, physical projector readability | Manual checks below |

## Headless audit evidence

Chromium audited the four Controller viewport sizes in A1 and eight Presentation scenarios,
including the minimum 480×270 Preview size. It used the `wcag2a`, `wcag2aa`, `wcag21a`,
`wcag21aa`, and `best-practice` tags. Counts represent affected elements across scenarios.

| Rule | Impact | Where | Before | After |
| --- | --- | --- | ---: | ---: |
| `color-contrast` | Serious | Light Controller footer | 113 | 0 |
| `label-content-name-mismatch` | Serious | Single Image thumbnail badges | 16 light, 16 dark | 0 |
| `aria-prohibited-attr` | Serious | Presentation Game Board game number | 4 | 0 |
| `landmark-one-main` | Moderate | Presentation Game Board and Countdown | 5 | 0 |
| `page-has-heading-one` | Moderate | Presentation Game Board and Countdown | 5 | 0 |
| `region` | Moderate | Presentation Game Board game number | 3 | 0 |

| Contrast pair | Before | After |
| --- | ---: | ---: |
| Light footer on the Controller surface | 3.81:1 | 4.66:1 |
| Dark footer on the Controller surface | approximately 4.68:1 | 4.68:1 |
| Dark focus outline against the standard panel | 3.15:1 | 8.00:1 |
| Dark focus outline against the info panel | 2.58:1 | 6.56:1 |
| Projector blackout letter against the board | 1.58:1 | 4.79:1 |
| Small red ball chip letter against its fill | 4.33:1 | 5.10:1 |

The light focus outline measures 6.14:1 against the Controller surface and 6.70:1 against its panel.
Dark numerals on the blue, red, white, green, and yellow ball fills measure 5.58:1, 5.10:1, 17.74:1,
7.81:1, and 11.87:1 respectively. Axe left some image overlays and clipped or obscured text for
review. The white thumbnail fit badge text over its 70% black scrim reaches 8.45:1 even over a white
image. The checklist below covers actual displays and screen reader behavior.

## A. Focus and game operation

- [ ] A1. With Tab and Shift+Tab, check the visible focus ring and reading order at compact (about
      910×480), strip (about 1280×720) and rail (1536×864 and 1913×1025) sizes. Repeat in both
      themes. Confirm that focus scrolls into view and skips disabled or hidden controls.
- [ ] A2. Tab to an uncalled ball and press Space. Confirm the number, pressed state and current
      call. Press Space again to remove it. Tab to a row letter, toggle blackout, and verify that
      its disabled balls are skipped until you restore the row.
- [ ] A3. Activate **BINGO CALLED** and verify focus stays on **Dismiss BINGO Banner**. Check that the
      projector shows the banner and the balls are skipped while locked. Activate Dismiss and call
      another ball.
- [ ] A4. With at least one called ball, open **New Game**. Listen for the title and description.
      Confirm focus starts on **Cancel**, cycles within the dialog with Tab and Shift+Tab, and
      returns to **New Game** after Escape. Reopen and confirm. Verify the calls clear and a row is
      added to **Games played**.
- [ ] A5. In a tall window, tab to the games history scroll region and scroll with the keyboard.
      Read the column headings and a game row. Open **Clear history…** and repeat the dialog
      announcement, focus trap and Escape checks. Reopen and confirm with disposable history.

## B. Modes and patterns

- [ ] B1. Tab into the mode tabs. Use Left and Right to move focus without changing the projector.
      Press Enter or Space to activate. Check that Tab continues in the expected visual order and
      the screen reader announces the selected tab and panel.
- [ ] B2. On Game Board in a wide window, pick a saved pattern using the keyboard, then activate
      **Show on projector**. Check the title and grid on the second display.
- [ ] B3. Open **Edit patterns…** (or the compact **Pattern** card). Verify focus lands in the editor.
      Change a cell with Space and edit the pattern name. Confirm the projector shows the previous
      version until you return to Game Board and activate **Update projector**. Check focus on return.
- [ ] B4. In **Slideshow**, create or select a collection. Use **Add images…** and the Windows file
      picker to add two local images with the keyboard. Tab to each slide's reorder buttons.
      Check that their names identify the slide and direction, and that activating one changes
      the order. Verify the new order and focus after the move.
- [ ] B5. In **Countdown**, set a short duration and press **Start**. Check the timer is readable and
      that a screen reader can inspect it without announcing every tick. Check the expiry message.

## C. Display, theme and notices

- [ ] C1. Select the external display using the keyboard. Activate **Project** and check that focus
      stays on the Controller. Activate **Stop**, then **Preview**. Verify the Preview has no
      controls and closing it leaves the Controller usable.
- [ ] C2. Tab to **Dark mode** and toggle it with Space. Confirm the switch announces its new state
      and focus remains visible. Check that the Presentation keeps its dark palette. Read the
      board, all five ball colors, blackout letter, banner and countdown from the back of the room.
- [ ] C3. Using a disposable profile, follow the failed-save setup in
      [Storage manual acceptance](manual-acceptance-storage.md). Listen for the failed-save notice
      and tab to **Try again** and **Show data folder**. Restore write access and activate **Try again**.
- [ ] C4. Turn off animation effects in Windows accessibility settings and check that ball and tab
      presses have no transition.

## Record anything you could not check

Record the item, reason, Windows scaling and screen reader version if applicable. Physical keyboard
operation, assistive technology announcements, the native file picker and projector readability
remain pending a human pass.
