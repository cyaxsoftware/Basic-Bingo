# Milestone 4 — manual acceptance checklist

Run on the target Windows 11 touchscreen laptop with an external monitor or projector, using the packaged
app (`npm run make` or `npm run package`), a **real USB stick** with some pictures on it, and a **real
PowerPoint deck** (`.pptx`) with desktop PowerPoint installed.

Automated E2E tests cover the logic and layout. This checklist covers what needs real hardware and a human
eye: a physical projector, a USB stick coming and going, PowerPoint itself, and reading the screen from the
back of the room. The M1, M2 and M3 checklists ([M1](manual-acceptance-m1.md), [M2](manual-acceptance-m2.md),
[M3](manual-acceptance-m3.md)) still apply and are not repeated here.

**You do not have to start from scratch.** If you have already tried an item while using the app (adding
images, importing a deck, projecting a slideshow), tick it and write the date beside it. Only the items you
have not seen with your own eyes need a pass.

Tester: ____________ Date: ____________ Build/commit: ____________

## What is automated, and where

Design doc §9 "Projection and media" items and the milestone's own behaviour, so nothing is left unchecked by
accident.

| Item                                                                                | Automated in                                                                |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| An imported image is kept: it still shows after the original is deleted and a restart | `milestone4.spec.ts` (an imported image is kept...)                         |
| Choose, Fit / Fill and Remove reach the projector; the game and pattern are untouched | `milestone4.spec.ts` (choosing, Fit / Fill and removing...)                 |
| Files that are not images are refused with the reason; the library is unchanged     | `milestone4.spec.ts` (files that are not images are refused...)             |
| The offline policy blocks every remote address while library images still load       | `milestone4.spec.ts` (the offline policy still blocks...)                   |
| Slideshow holds a chosen slide, continues from it, and loops after the countdown ends | `milestone4.spec.ts` (slideshow holds a chosen slide...)                    |
| Countdown starts, holds while paused, resumes and shows Time to Play at zero         | `milestone4.spec.ts` (the countdown starts, holds...)                       |
| A running countdown keeps its deadline across mode changes and a restart             | `milestone4.spec.ts` (a running countdown keeps...)                         |
| Switching modes leaves the calls, the pattern and the BINGO state unchanged          | `milestone2.spec.ts`, `milestone4.spec.ts`                                  |
| Slideshow rules: collections, order, intervals, hold, continue, rotation             | unit tests (`slideshow.test.ts`, `slideshowPlayback.test.ts`, `slideshowService.test.ts`)               |
| Image library: copy in, kept after the source is removed, missing-file reporting     | unit tests (`mediaService.test.ts`)                                         |
| Network files are refused before they are read (the app is offline)                  | unit tests (`sourceLocation.test.ts`, `mediaService.test.ts`)               |
| PowerPoint import: conversion, ordering, cleanup, refusal of network or bad files    | unit tests (`powerPointImport.test.ts`; it uses a stand-in for PowerPoint)           |
| Save file recovery: a damaged media, slideshow or timer section never costs the game | unit tests (`persistedState.test.ts`)                                       |
| Controller and projector fit at the target sizes (Game Board)                        | `controllerLayout.spec.ts`, `projectorLayout.spec.ts`                       |
| How the image modes look and read from the back of the room                          | **Manual: B, C, D below**                                                   |
| Real PowerPoint, real USB stick, a projector that is plugged and unplugged           | **Manual: B, C, F below**                                                   |
| Restart **without Wi-Fi** (real offline)                                             | **Manual: G below**                                                         |

## A. Setup

- [ ] A1. Connect the external display. Press **Win + P → Extend**. Start the app.
- [ ] A2. Press **Project**. The projector shows the Game Board. The Controller stays on the laptop.
- [ ] A3. Put the USB stick in. It should have several pictures: at least one wide, one tall (portrait), one
      small, and one very large (several MB).

## B. Single Image (a real USB stick)

- [ ] B1. Open the **Single Image** tab. The projector shows a plain "No image selected" screen, never a
      broken-picture icon.
- [ ] B2. Press **Add images…** and choose several pictures from the USB stick at once. They appear in the
      library. The first one added is shown on the projector.
- [ ] B3. **Remove the USB stick.** The library thumbnails and the picture on the projector are still there.
      Tap another thumbnail: it shows on the projector.
- [ ] B4. For each picture, try **Fit**, **Fill** and **Original**. Fit shows the whole picture with black bars if
      its shape is different. Fill covers the screen and crops. Original shows it at its own size, centred (a
      small one is not enlarged). **Each picture remembers its own setting**: switch to another picture and
      back.
- [ ] B5. A logo or flag looks right on the projector in Fit. It is readable from the back of the room.
- [ ] B6. Try to add a file that is not a picture (a `.txt` or `.docx`). It is refused with a reason, and nothing
      is added.
- [ ] B7. **Remove this image…** asks first. Cancel changes nothing. Confirm removes it, and the projector shows
      the plain screen if it was the one on screen.
- [ ] B8. The projector never shows a countdown over a Single Image.
- [ ] B9. With the **Controller maximised** the preview and the fit controls sit side by side, and the library
      thumbnails are easy to hit with a finger.

## C. Slideshow (collections, pictures and PowerPoint)

- [ ] C1. Open the **Slideshow** tab. With no collection, the page explains what to do and the projector shows a
      calm placeholder.
- [ ] C2. **New collection**, give it a name (for example _Sponsors_). It is selected.
- [ ] C3. **Add images…** from the USB stick. Each picture becomes a numbered slide. Remove the stick: the
      slides stay.
- [ ] C4. **Import PowerPoint…** and choose a real `.pptx` from the computer (not a network drive). The slides
      are added in the deck's order as numbered pictures. A widescreen deck looks sharp on the projector.
- [ ] C5. Import a deck that is 4:3, or has odd proportions. Its slides keep their proportions.
- [ ] C6. Animations in the deck show only as the finished slide. Nothing plays, and nothing breaks.
- [ ] C7. Import the **same deck again**. A second set of slides is appended (that is expected).
- [ ] C8. Try to import a file from a network share, or a file that is not a deck. It is refused with a plain
      reason, and nothing is added.
- [ ] C9. Use the **arrows** above a slide to move it earlier and later, and the **trash can** to remove it. The
      numbers update. The first slide cannot move earlier, and the last cannot move later.
- [ ] C10. Give one slide its own fit (**Original**, **Fit**, **Fill**), then **Use collection fit** again.
- [ ] C11. Under **Collection settings** change the interval (for example 5 seconds) and the default fit.
- [ ] C12. Press **Start**. The slides rotate on the projector and **loop** back to the first. Press **Stop**: it
      stays on the current slide.
- [ ] C13. Tap a thumbnail: that slide shows at once and **holds**. **Continue** gives it a full interval, then
      carries on from there.
- [ ] C14. Choose a different collection, or leave the Slideshow tab: the rotation stops.
- [ ] C15. Turn on the break countdown (**Countdown settings**). It sits in the **upper-right corner** of the
      slides and is readable from the back of the room. At zero it reads **Time to Play!** while the slides
      keep rotating.
- [ ] C16. Turn **Show timer on slideshow** off. The countdown disappears from the slides. Close and reopen the
      app: it is still off.

## D. Countdown (standalone tab)

- [ ] D1. Open the **Countdown** tab. Try the 1, 2, 5, 10, 15 and 20 minute buttons, then a custom time and
      **Set duration**.
- [ ] D2. Change the message. It appears centred on the projector with large digits, easy to read from the back
      of the room.
- [ ] D3. **Start**, **Pause** (the projector says Paused), **Resume**, **Reset**.
- [ ] D4. Let a short countdown run to zero. The projector shows only **Time to Play!**.
- [ ] D5. Start a countdown, switch tabs and back, and switch the projector to another mode: the countdown
      keeps its own time.
- [ ] D6. Start a 5 minute countdown, close the app, wait a minute, start it again. It shows the right
      remaining time. (If the time passed while it was closed, it shows as finished.)

## E. Switching modes does not touch the game

- [ ] E1. Call some balls, push a pattern, and raise **BINGO CALLED**. Switch the projector through
      **Slideshow**, **Single Image**, **Countdown** and back to **Game Board**. The calls, the pattern and the
      BINGO banner are exactly as you left them.
- [ ] E2. While on a break mode, the Controller shows no New Game, pattern widget or BINGO button, and the
      ball board is not squeezed on the Game Board when you return.
- [ ] E3. Press **New Game** while a countdown is running (from the Game Board). The countdown carries on.

## F. The projector comes and goes

- [ ] F1. **Unplug the projector** while it is showing a slideshow. The Controller stays usable and tells you
      what happened. Nothing crashes. Plug it back in and press **Project** again.
- [ ] F2. Disconnect the external display completely and press **Preview**. The preview window opens on the
      laptop and works.
- [ ] F3. Try the projector at 16:9 and, if you can, 4:3. Pictures and the countdown are not cut off.

## G. Restart and offline

Turn Wi-Fi off and unplug the network cable first.

- [ ] G1. With pictures in the Single Image library, a collection with slides, and a countdown set, close the
      app and start it again.
- [ ] G2. Everything is still there: the library, the chosen picture, the collection and its settings, the
      countdown settings.
- [ ] G3. Nothing in the app tries to reach the internet or shows a network error, including during the
      PowerPoint import.

## Sign-off

- Open issues found: ____________________________________________
- [ ] No open issues. Milestone 4 accepted.

Signed: ____________ Date: ____________
