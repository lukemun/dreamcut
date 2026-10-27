import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const input = process.argv[2];
if (!input) throw new Error('usage: pnpm music-tempo-audition <audio-file> [--seconds 20] [--start 40]');

const python = process.env.MUSIC_PYTHON ?? path.join(__dirname, "..", ".venv-music", "bin", "python");
if (!fs.existsSync(python)) {
  throw new Error(`No analysis python at ${python}. See catalogs/music/README.md, or set MUSIC_PYTHON.`);
}

execFileSync(python, [path.join(__dirname, "music-tempo-audition.py"), ...process.argv.slice(2)], {
  stdio: "inherit",
});
