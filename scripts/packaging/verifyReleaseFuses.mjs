import { FuseState, FuseV1Options, FuseVersion, getCurrentFuseWire } from '@electron/fuses';

const executable = process.argv[2];
if (!executable) throw new Error('Pass the path of the packaged Windows executable.');

const expected = [
  [FuseV1Options.RunAsNode, FuseState.DISABLE],
  [FuseV1Options.EnableCookieEncryption, FuseState.ENABLE],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, FuseState.DISABLE],
  [FuseV1Options.EnableNodeCliInspectArguments, FuseState.DISABLE],
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FuseState.ENABLE],
  [FuseV1Options.OnlyLoadAppFromAsar, FuseState.ENABLE],
];
const wire = await getCurrentFuseWire(executable);
if (wire.version !== FuseVersion.V1)
  throw new Error(`Unexpected Electron fuse wire version: ${wire.version}`);
for (const [fuse, state] of expected) {
  if (wire[fuse] !== state) {
    throw new Error(`Release fuse ${FuseV1Options[fuse]} must be ${FuseState[state]}.`);
  }
}
console.log('Verified the six production fuses on the packaged executable.');
