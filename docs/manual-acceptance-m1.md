# Milestone 1 — manual acceptance checklist

Run on the target Windows 11 touchscreen laptop with an external monitor or projector. Use the
packaged app (`npm run make` or `npm run package`) for the offline steps.

Automated E2E tests (`npm run test:e2e`) already cover Preview sync, toggle ordering, restart
persistence, sandboxing and the single-instance lock. This checklist covers what needs real hardware.

Tester: ____________  Date: ____________  Build/commit: ____________

## A. Setup

- [ ] A1. Connect the external display. Press **Win + P → Extend**.
- [ ] A2. Start the app. The Controller opens maximized **on the laptop screen**.
- [ ] A3. Status reads **Not projecting**. The drop-down lists the external display by name and
      resolution, and does not list the laptop screen (it hosts the Controller).

## B. Projecting and calling (Definition of Done)

- [ ] B1. Press **Project**. The Presentation fills the external display with no border, title bar or
      taskbar. The Controller stays on the laptop and keeps focus. Status reads
      **Projecting on <display name>**. The projector shows **Ready for first call**.
- [ ] B2. Tap **3** (B row) with a finger. B-3 appears on the projector at once as the large current
      ball and highlighted on the board.
- [ ] B3. Tap **9** and **17**. Current = I-17. Previous = B-9, B-3.
- [ ] B4. Tap **9** again (toggle off). Calls are 3, 17 in that order. Current = I-17,
      previous = B-3. Board 9 is no longer lit.
- [ ] B5. Tap **9** again (toggle back on). Current = B-9, previous = I-17, B-3.
- [ ] B6. Tap an N number (31–45). On the Controller the called white ball is clearly different from
      uncalled grey balls; on the projector it shows white.
- [ ] B7. Projector check from the back of the room: numbers and current ball readable.
- [ ] B8. Pinch or double-tap on the Controller does not zoom the page.

## C. Window behavior

- [ ] C1. Press **Stop**. The projector window closes; Controller and calls unchanged; status **Not
      projecting**.
- [ ] C2. Press **Project** again. The projector shows the current state immediately (not empty).
- [ ] C3. With the projector open, close it with Alt+F4 while it has focus (click it first). The
      Controller stays; status updates to **Not projecting**.
- [ ] C4. Press **Preview**. A resizable window opens on the laptop with the same state. Resize it to
      wide and to nearly square: nothing is cut off or overlapping.
- [ ] C5. Launch the app a second time from the Start menu or shortcut. No second Controller appears;
      the existing one comes to the front.

## D. Display loss and recovery

- [ ] D1. While projecting, **unplug the external display**. The app does not crash; no invisible
      window is left behind; the Controller shows a warning that the display was disconnected; calls
      are unchanged.
- [ ] D2. Press **Preview**. It works on the laptop alone.
- [ ] D3. Reconnect the display (Win + P → Extend if needed), wait for it to appear in the display list, choose it,
      press **Project**. Projection resumes with the current state.
- [ ] D4. (Optional) Change the external display's resolution or scaling in Windows Settings while
      projecting. The Presentation refits the display.

## E. Persistence and offline operation

- [ ] E1. With several balls called (note the exact order), close the Controller window. The app exits.
- [ ] E2. **Disable Wi-Fi and unplug Ethernet.**
- [ ] E3. Start the app. The same calls appear **in the same order**, with the same current and previous
      five. The projector does **not** open by itself; the previously used display is pre-selected.
- [ ] E4. Project and call more balls while offline. No network prompts or errors appear.
- [ ] E5. Force-quit the app (Task Manager → End task) right after tapping a ball. Restart: the last
      tapped ball is present.
- [ ] E6. Repeat a short session at **125%** and, if practical, **150%** Windows scaling on the laptop.
      Ball buttons stay comfortably tappable and the number grid does not scroll sideways.

## Result

- [ ] All items pass → move the M1 human acceptance card to **Done**.
- Problems found (item, what happened, screenshot):

  ____________________________________________________________________________
