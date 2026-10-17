import fs from "node:fs";
import path from "node:path";

/**
 * The local subject-tracing environment that `cutout_setup` (scripts/setup-matting.mjs) installs:
 * app data for an installed runtime (TIMELINE_MATTING_DIR), `.matting` in a checkout.
 * scripts/run-sam2-cutout.mjs mirrors this resolution in plain JavaScript.
 */
export const MATTING_CHECKPOINT = "sam2.1_hiera_small.pt";
export const mattingRoot = () => path.resolve(process.env.TIMELINE_MATTING_DIR ?? ".matting");
export const mattingPython = (root = mattingRoot()) =>
  path.join(root, "venv", ...(process.platform === "win32" ? ["Scripts", "python.exe"] : ["bin", "python"]));

export function mattingNotInstalledError() {
  return Object.assign(new Error("Subject tracing is not installed. It is a one-time download of about 1 GB: ask the creator, then call cutout_setup with action install, wait until its status is ready, and retry."), { code: "MATTING_NOT_INSTALLED" });
}

/** The environment's Python, or MATTING_NOT_INSTALLED. `checkpoint` also requires the SAM model. */
export function requireMattingPython({ checkpoint = false } = {}) {
  const root = mattingRoot(), python = mattingPython(root);
  if (!fs.existsSync(python) || (checkpoint && !fs.existsSync(path.join(root, MATTING_CHECKPOINT)))) throw mattingNotInstalledError();
  return python;
}
