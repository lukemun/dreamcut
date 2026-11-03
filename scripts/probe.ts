import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const input = process.argv[2];
if (!input) throw new Error("usage: pnpm probe <media-file> [--out report.json]");
const outIndex = process.argv.indexOf("--out");
const output = outIndex >= 0 ? process.argv[outIndex + 1] : `${input}.probe.json`;
const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", input], { encoding: "utf8" }));
const qc = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", input, "-vf", "blackdetect=d=0.1:pix_th=0.10,freezedetect=n=-60dB:d=2", "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" });
const log = `${qc.stdout ?? ""}\n${qc.stderr ?? ""}`;
const lastNumber = (pattern: RegExp) => {
  const matches = [...log.matchAll(pattern)];
  return Number(matches.at(-1)?.[1] ?? NaN);
};
const report = {
  input,
  probe,
  black: [...log.matchAll(/black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)/g)].map((m) => ({ start: +m[1], end: +m[2], duration: +m[3] })),
  freezes: [...log.matchAll(/freeze_(start|end):\s*([\d.]+)/g)].map((m) => ({ event: m[1], at: +m[2] })),
  loudness: {
    integratedLufs: lastNumber(/I:\s*(-?[\d.]+) LUFS/g),
    truePeakDbfs: lastNumber(/Peak:\s*(-?[\d.]+) dBFS/g),
  },
};
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(output);
