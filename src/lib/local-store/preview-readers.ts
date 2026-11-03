import fs from "node:fs";
import path from "node:path";
import { projectDir } from "./paths";
import { withFileLock, writeJsonFileAtomic } from "./atomic-json";

/** Set only by the local supervisor that keeps the browser origin alive across service updates. */
function readerOwnerPid(): number {
  const owner = Number(process.env.DREAMCUT_PREVIEW_READER_OWNER_PID);
  return Number.isSafeInteger(owner) && owner > 0 ? owner : process.pid;
}

const directory = (projectId: string) => path.join(projectDir(projectId), "preprocess", "preview-readers");
export const withPreviewReadersLock = <T>(projectId: string, run: () => T): T =>
  withFileLock(path.join(directory(projectId), "ownership"), run, { staleMs: Infinity });

/** A suspended tab may keep a hydrated URL indefinitely. Do not expire readers by age:
 * a supervisor holds every URL its services hand out until it exits, including across backend
 * handoffs. An unsupervised service owns its own leases. A later retirement reclaims dead owners' files. Lease files deliberately are not project media-reference JSON. */
export function retainPreviewReader(projectId: string, relative: string) {
  if (!relative.startsWith(".prepared/")) return;
  withPreviewReadersLock(projectId, () => {
    const file = path.join(directory(projectId), `${readerOwnerPid()}.lease`);
    const paths: string[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
    if (!paths.includes(relative)) writeJsonFileAtomic(file, [...paths, relative]);
  });
}

/** Called under the same ownership lock as URL publication. Unknown liveness retains. */
export function activePreviewReaders(projectId: string): Set<string> {
  const active = new Set<string>();
  const dir = directory(projectId);
  if (!fs.existsSync(dir)) return active;
  for (const name of fs.readdirSync(dir).filter(name => /^\d+\.lease$/.test(name))) {
    const file = path.join(dir, name);
    try { process.kill(Number(name.split(".")[0]), 0); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") { fs.unlinkSync(file); continue; }
      // EPERM does not establish that a reader has stopped.
    }
    for (const relative of JSON.parse(fs.readFileSync(file, "utf8")) as string[]) active.add(relative);
  }
  return active;
}
