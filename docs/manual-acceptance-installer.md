# Windows installer acceptance

Use a disposable Windows 11 account or VM for install and uninstall checks. Build with
`npm run make` and use `out/make/squirrel.windows/x64/BasicBingoSetup.exe`.

Tester: ____________ Date: ____________ Build/commit: ____________

## What is automated

| Item | Check |
| --- | --- |
| Controller title shows the installed build version | `src/main/windows/controllerWindow.test.ts` |
| Setup and application metadata, embedded icons, bundled payload and signatures | Artifact inspection after `npm run make` |
| English-only runtime resources and the English fallback | Unit tests and archive inspection |
| Actual installation, shortcut display, and saved data after reinstall | Manual checks below |

## Install and reinstall

- [ ] Install from the local Setup file with networking off. Check that **Basic Bingo** appears
      in Installed apps and the Start menu.
- [ ] Launch from Start. Check the Basic Bingo icon in the taskbar, pin it, close the app, and reopen
      from the pin. The running window should group with the pin. Check that the Controller title
      shows the same version as Setup and Installed apps.
- [ ] Call two balls, make a pattern edit, and import a local image. Close the app to save.
- [ ] Uninstall through Installed apps. Verify the app and its Start shortcut are removed and
      `%APPDATA%\Basic Bingo\bingo-data` still contains the save and media.
- [ ] Reinstall under the same Windows account. Verify the calls, working pattern, and imported
      image are present.

## Signing for a future release

This release builds unsigned. If a future release uses a code-signing certificate, configure
`windowsSign` on both `packagerConfig` and `MakerSquirrel` in `forge.config.mts`. For a PFX,
provide the path and password through the build environment with `certificateFile` and
`certificatePassword`. Build with `npm run make` and use `Get-AuthenticodeSignature` to verify the
packaged `basic-bingo.exe` and `BasicBingoSetup.exe` both have a valid signature from the expected
publisher. See the [Electron Windows signing options](https://github.com/electron/windows-sign).
