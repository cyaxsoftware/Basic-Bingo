# Storage problems — manual acceptance checklist

For card #45. Every message an operator can see when the app's storage misbehaves, how to cause it on a real
Windows machine, and what you should see. The automated tests already cover the logic with simulated faults
(`storageFaults.test.ts`, `recoveryNotices.test.ts`, `storageProblem.test.ts`, `stateRepository.test.ts`); this
list is for reading each message once as a person, and checking the buttons really work.

The data folder is `%APPDATA%\Basic Bingo\bingo-data`. **Close the app before each "restart" step, and put
everything back afterwards.** Take a copy of that folder first so nothing is lost: `Copy-Item -Recurse` it
somewhere safe.

Tester: ____________ Date: ____________ Build/commit: ____________

## What you should see in every case

- The message is in plain words, says what to do, and shows **no file name, no folder path and no error code**.
- A failed save always offers **Try again** and **Show data folder**.
- The game on screen keeps working. Nothing is lost that was already saved.

## A. A save fails (the red bar above the board)

Start the app, call two balls, then cause the problem, then call one more ball.

- [ ] A1. **Folder locked or read-only.** In PowerShell:
      `icacls "$env:APPDATA\Basic Bingo\bingo-data" /deny "$env:USERNAME`:(W,D)"`.
      After the next call the bar says Windows will not let the app write to its data folder, and offers **Try
      again** and **Show data folder**.
- [ ] A2. Press **Try again** while it is still blocked. The same message stays. Nothing crashes.
- [ ] A3. Undo it: `icacls "$env:APPDATA\Basic Bingo\bingo-data" /remove:d "$env:USERNAME"`. Press **Try
      again**. The bar goes away, and after closing and reopening the app all three calls are there.
- [ ] A4. **File in use by another program.** In PowerShell, hold the save file open:
      `$f = [IO.File]::Open("$env:APPDATA\Basic Bingo\bingo-data\state.json",'Open','Read','None')`.
      Call a ball. The bar says another program is using the save file (or that Windows will not let the app
      write). Release it (`$f.Close()`), press **Try again**: the bar goes away.
- [ ] A5. **Show data folder** opens the data folder in Explorer. (Also try it with the folder missing: rename it
      while the app is closed, start the app, press it. The app recreates the folder and opens it.)
- [ ] A6. **Disk full** (optional; hard to cause safely). If you can point the data folder at a tiny disk (a small
      virtual disk), fill it and call a ball. The bar says the computer's disk is full and tells you to free
      space. Free some space and press **Try again**. Skip this if you cannot, the logic is covered by tests.

## B. The saved game is damaged (shown when the app starts)

- [ ] B1. Close the app. Open `state.json` in Notepad, delete the last half of the text, save. Start the app. A
      yellow notice says the saved game was damaged and the **last good copy was restored**, and asks you to check
      the called numbers. **Show data folder** is offered. The numbers are from just before the damage.
- [ ] B2. Close the app. Damage **both** `state.json` and `state.json.bak` the same way. Start the app. A red
      notice says the saved game was damaged and there was no good copy, so a **new game was started**, and that
      the damaged file was kept. **Show data folder** shows the kept file.
- [ ] B3. Neither notice mentions `state.json`, `.bak`, `JSON` or any error code.

## C. The saved game cannot be opened (locked, not damaged)

- [ ] C1. Close the app. Hold the save file open exactly as in A4 (`$f = [IO.File]::Open(...)`). Start the app. A
      notice says the saved game **could not be opened** (another program may have it locked) and that the
      earlier game **has not been deleted**, with advice to close other programs and restart. It does **not** say
      the file is damaged.
- [ ] C2. Release the lock (`$f.Close()`), close and restart the app. The earlier game is back.

## D. A picture's file has gone missing

- [ ] D1. Add a picture to the Single Image library, close the app, delete that picture's file from
      `bingo-data\media`, start the app. A yellow notice says a picture is missing and will show as
      unavailable, names the picture, and tells you to add it again or remove it. **Show data folder** opens the
      folder.
- [ ] D2. The projector shows "Image unavailable" for it, never a broken-picture icon.

## E. Adding a picture or slide fails

- [ ] E1. With the data folder blocked as in A1, try **Add images…**. The picture is skipped with a reason in plain
      words (Windows would not let the app write to its data folder), not an error code.

## Sign-off

- Open issues found: ____________________________________________
- [ ] No open issues. Storage problems are understandable and recoverable.

Signed: ____________ Date: ____________
