import fs from "node:fs";
import path from "node:path";

// A packaged runtime's code never changes after it is built, so desktop/code-identity.mjs writes one
// identity for all of it (code-identity.json). Caches and evidence stamps that fingerprint DreamCut's own
// source use it there; in a checkout, where source changes under `pnpm dev`, they hash the source files.

export const CODE_IDENTITY_FILE = "code-identity.json";

/** The packaged build's code identity, or null in a checkout. */
export function packagedCodeIdentity(root = process.cwd()): string | null {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(root, CODE_IDENTITY_FILE), "utf8")) as { schema?: unknown; identity?: unknown };
    return value.schema === 1 && typeof value.identity === "string" && /^[a-f0-9]{64}$/.test(value.identity) ? value.identity : null;
  } catch { return null; }
}
