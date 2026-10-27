import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const input = process.argv[2];
const value = (flag: string) => process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : undefined;
if (!input) throw new Error("usage: pnpm beat-grid <audio> [--out beats.json]");
const out = value("--out") ?? `${input}.beats.json`;

// Repo-relative venvs first; BEAT_PYTHON overrides. (The old default was a
// hardcoded /private/tmp path that only existed on one machine.)
const candidates = [
  process.env.BEAT_PYTHON,
  path.resolve(__dirname, "..", ".venv-music", "bin", "python"),
  path.resolve(__dirname, "..", ".mfa-venv", "bin", "python"),
].filter((candidate): candidate is string => !!candidate);
const python = candidates.find((candidate) => existsSync(candidate));
if (!python) {
  throw new Error(
    `No analysis Python found. Tried: ${candidates.join(", ")}. Create .venv-music (librosa) or set BEAT_PYTHON.`,
  );
}
execFileSync(python, [path.join(__dirname, "beat-grid.py"), input, "--out", out], { stdio: "inherit" });
