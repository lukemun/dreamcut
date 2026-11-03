/** Private local credentials (the DreamCut Cloud session). Never include these records in project exports
 * or API responses. Generation has no bring-your-own provider key: it runs through DreamCut Cloud credits. */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { profileDir } from "./editing-memory";

const keyDirectory = () => path.join(profileDir(), "private-credentials");
function assertPrivateDirectory() {
  fs.mkdirSync(keyDirectory(), { recursive: true, mode: 0o700 });
  if (!fs.lstatSync(keyDirectory()).isDirectory() || fs.lstatSync(keyDirectory()).isSymbolicLink()) throw new Error("Credential storage is unavailable.");
  fs.chmodSync(keyDirectory(), 0o700);
}
const credentialFile = (name: string) => {
  if (!/^[a-z0-9-]{1,64}\.json$/.test(name)) throw new Error("Invalid credential name.");
  return path.join(keyDirectory(), name);
};
/** Reads one JSON credential from `private-credentials/` without following links. Missing → undefined. */
export function readPrivateCredential(name: string, maxBytes = 4096): unknown {
  try {
    if (!fs.existsSync(keyDirectory())) return undefined;
    if (fs.lstatSync(keyDirectory()).isSymbolicLink()) throw new Error();
    const fd = fs.openSync(credentialFile(name), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.size > maxBytes) throw new Error();
      return JSON.parse(fs.readFileSync(fd, "utf8"));
    } finally { fs.closeSync(fd); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error("Could not read a saved credential.");
  }
}
/** Atomically writes one JSON credential, readable only by this user (0600 in a 0700 folder). */
export function writePrivateCredential(name: string, value: unknown) {
  assertPrivateDirectory();
  const temp = path.join(keyDirectory(), `.${randomUUID()}.tmp`);
  try {
    const fd = fs.openSync(temp, "wx", 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, credentialFile(name));
  } finally { fs.rmSync(temp, { force: true }); }
}
export function removePrivateCredential(name: string) {
  if (!fs.existsSync(keyDirectory())) return;
  assertPrivateDirectory(); fs.rmSync(credentialFile(name), { force: true });
}
