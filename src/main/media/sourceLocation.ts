import { realpath } from 'node:fs/promises';
import path from 'node:path';

const NETWORK_REASON = 'it is on a network location: copy it to this computer or a USB stick first';

/** `\\server\share\...`, `\\?\...` and `//server/...` all begin with two separators: network or device paths. */
const isNetworkLike = (location: string) => /^[\\/]{2}/.test(location);

/**
 * Why a file the operator picked must not be read, or null when it is on this computer. The app is offline: it must
 * not read a slide over a network share, whether it was picked as `\\server\share\x.png` or through a mapped drive
 * (`Z:\x.png`, which Windows reports as an ordinary drive letter).
 *
 * It decides from the path alone where it can (a UNC path is refused without touching it) and otherwise looks only at
 * the drive's ROOT, never at the file: a mapped drive's root resolves to its `\\server\share` location. `resolveRoot`
 * is a parameter so tests need no network.
 */
export async function networkSourceProblem(
  source: string,
  resolveRoot: (root: string) => Promise<string> = realpath,
): Promise<string | null> {
  if (isNetworkLike(source)) return NETWORK_REASON;
  const root = path.parse(source).root;
  if (!/^[A-Za-z]:[\\/]$/.test(root)) return null;
  try {
    return isNetworkLike(await resolveRoot(root)) ? NETWORK_REASON : null;
  } catch {
    // A drive that cannot even be looked at (an unplugged stick, a lost share) is not safe to read from.
    return 'its drive could not be checked';
  }
}
