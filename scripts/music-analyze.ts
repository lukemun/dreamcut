import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// .opus/.webm matter: media-pull's default (and fastest) invocation keeps the native container,
// so a yt-dlp reference pull lands as .opus. Omitting them made the analyzer skip such files in
// silence, which reads as "nothing to do" rather than "I could not read that."
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".opus", ".webm"]);

const value = (flag: string) =>
  process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : undefined;

const catalogDir =
  process.env.TIMELINE_MUSIC_CATALOG_DIR ?? path.join(__dirname, "..", "music-catalog");
const audioDir = path.join(catalogDir, "audio");
const python = process.env.MUSIC_PYTHON ?? path.join(__dirname, "..", ".venv-music", "bin", "python");

if (!fs.existsSync(python)) {
  throw new Error(
    `No analysis python at ${python}. Create it with:\n  python3 -m venv .venv-music && ./.venv-music/bin/pip install librosa soundfile\nOr set MUSIC_PYTHON.`,
  );
}

const target = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : undefined;

// Walk audio/ recursively: the status folders (owned/ licensed/ reference/) are subdirectories,
// and the folder a file sits in is what declares its source status at promote time.
// Derived audio the pipeline itself wrote (tempo-audition excerpts). They live beside the track so
// they are easy to play, but they are outputs, not sources — analyzing them would file the
// pipeline's own scratch work into the catalog as if it were music.
const isDerivedArtifact = (name: string) => /\.tempo-[\d.]+\.wav$/i.test(name);

const walk = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        if (isDerivedArtifact(entry.name)) return [];
        return AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) ? [full] : [];
      })
    : [];

const inputs = target ? [target] : walk(audioDir);

if (inputs.length === 0) {
  console.log(
    `No audio found under ${audioDir} (gitignored).\n\n` +
      `File each track by where it may be used:\n` +
      `  audio/owned/      you made it (AI-generated, recorded)   -> ships in a render\n` +
      `  audio/licensed/   bought, CC-BY, or otherwise cleared    -> ships in a render\n` +
      `  audio/reference/  trending audio you cut against         -> never rendered; sound applied in-app\n\n` +
      `Usage: pnpm music-analyze [audio-file] [--segments 8] [--force]`,
  );
  process.exit(0);
}

const segments = value("--segments") ?? "8";
const force = process.argv.includes("--force");

let extracted = 0;
let cachedExtract = 0;
let derived = 0;

// Extraction is expensive (~21s/track) and frozen; derivation is a rule applied to it and costs
// milliseconds. So extract once and cache it, but ALWAYS re-derive: that is the whole point of the
// split — improving the role heuristic must never mean re-decoding the catalog.
for (const input of inputs) {
  const stem = input.replace(/\.[^.]+$/, "");
  const extractOut = `${stem}.extract.json`;
  const deriveOut = `${stem}.derive.json`;

  if (fs.existsSync(extractOut) && !force) {
    cachedExtract += 1;
  } else {
    console.log(`extracting (L1): ${path.basename(input)}`);
    execFileSync(python, [path.join(__dirname, "music-analyze.py"), input, "--out", extractOut, "--segments", segments], {
      stdio: "inherit",
    });
    extracted += 1;
  }

  execFileSync(python, [path.join(__dirname, "music-derive.py"), extractOut, "--out", deriveOut], {
    stdio: "inherit",
  });
  derived += 1;
}

console.log(
  `\nL1 extract: ${extracted} read, ${cachedExtract} cached (frozen — re-read only with --force).\n` +
    `L2 derive:  ${derived} recomputed from the extraction, never from the audio.\n\n` +
    `Everything in a .derive.json is a RULE over measured facts, not a measurement. Tempo is\n` +
    `unconfirmed (hear it: pnpm music-tempo-audition), downbeats assume 4/4, and vocal presence\n` +
    `is not determined at any level. Guidance (use_when, good_for) is L4 — it needs a goal.`,
);
