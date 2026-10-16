import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const mattingRoot = path.resolve(process.cwd(), process.env.TIMELINE_MATTING_DIR ?? ".matting");
const python = path.join(mattingRoot, "venv", "bin", "python");
const script = path.resolve(process.cwd(), "scripts/matting/hand_cutout.py");

if (!fs.existsSync(python) || !fs.existsSync(script)) {
  console.error("The local SAM 2 cutout environment is not installed; see scripts/matting/README.md");
  process.exit(2);
}

const child = spawn(python, [script, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: "1" },
});

child.on("error", (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
});

child.on("close", (code, signal) => {
  if (signal) {
    console.error(`SAM 2 cutout stopped by ${signal}`);
    process.exit(2);
  }
  process.exit(code ?? 2);
});
