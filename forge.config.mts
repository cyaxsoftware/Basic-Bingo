import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { keepEnglishLocalePacks } from './scripts/packaging/englishLocales';
import { COPYRIGHT_NOTICE, SQUIRREL_PACKAGE_ID, WINDOWS_EXECUTABLE_NAME } from './src/shared/appInfo';

/**
 * Build/packaging configuration.
 *
 * Renderer names below become Vite-injected globals in the main process:
 *   controller_window   -> CONTROLLER_WINDOW_VITE_DEV_SERVER_URL / CONTROLLER_WINDOW_VITE_NAME
 *   presentation_window -> PRESENTATION_WINDOW_VITE_DEV_SERVER_URL / PRESENTATION_WINDOW_VITE_NAME
 * Keep them in sync with src/types/forge-env.d.ts and src/main/windows/rendererEntry.ts.
 */
const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    afterExtract: [
      async ({ buildPath, platform }) => {
        if (platform === 'win32') await keepEnglishLocalePacks(buildPath);
      },
    ],
    executableName: WINDOWS_EXECUTABLE_NAME,
    // No extension: Packager appends .ico on Windows.
    icon: 'build/icon',
    appCopyright: COPYRIGHT_NOTICE,
    win32metadata: {
      CompanyName: 'Cyax Software',
      ProductName: 'Basic Bingo',
    },
  },
  rebuildConfig: {},
  makers: [
    // Windows installer (Setup.exe). Installs per-user, no admin rights required.
    new MakerSquirrel({
      name: SQUIRREL_PACKAGE_ID,
      setupExe: 'BasicBingoSetup.exe',
      setupIcon: 'build/icon.ico',
      // Squirrel writes its package description into Setup.exe's Product Name field.
      description: 'Basic Bingo',
      copyright: COPYRIGHT_NOTICE,
      // Ship Chromium's notices and omit Squirrel's default remote installer icon.
      nuspecTemplate: 'build/windows.nuspectemplate',
    }),
    // Portable zip, useful for rehearsal machines where installing is not allowed.
    new MakerZIP({}, ['win32']),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload/controllerPreload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
        {
          entry: 'src/preload/presentationPreload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'controller_window',
          config: 'vite.renderer.config.mts',
        },
        {
          name: 'presentation_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses harden the packaged binary before signing.
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
