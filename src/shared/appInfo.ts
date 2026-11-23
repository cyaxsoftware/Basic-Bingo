/** Windows install identifiers also determine the shortcut identity used for taskbar grouping. */
export const WINDOWS_EXECUTABLE_NAME = 'basic-bingo';
export const SQUIRREL_PACKAGE_ID = 'basic_bingo';
export const WINDOWS_APP_USER_MODEL_ID = `com.squirrel.${SQUIRREL_PACKAGE_ID}.${WINDOWS_EXECUTABLE_NAME}`;

/** Who owns the app, shown in the Controller's footer and in the Windows file properties. */
export const COPYRIGHT_NOTICE =
  'Copyright © 2026 Phil Cazella Consulting, DBA Cyax Software. All rights reserved.';

/** Shown as plain text, never a link: the app is offline-only and must not open web pages. */
export const CONTACT_WEBSITE = 'cyaxsoftware.com';
export const CONTACT_EMAIL = 'info@cyaxsoftware.com';
