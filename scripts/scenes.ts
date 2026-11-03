import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const input = process.argv[2];
const value = (flag: string) => process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : undefined;
if (!input) throw new Error("usage: pnpm scenes <video> [--threshold 10] [--out scenes.json]");
const threshold = Number(value("--threshold") ?? 10);
if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 100) throw new Error("--threshold must be between 0 and 100");
const out = value("--out") ?? `${input}.scenes.json`;
const run = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", input, "-vf", `scdet=threshold=${threshold},metadata=print`, "-an", "-f", "null", "-"], { encoding: "utf8" });
if (run.error) throw run.error;
const log = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
const cuts = Array.from(log.matchAll(/lavfi\.scd\.time=([\d.]+)/g), (match) => Number(match[1]));
const report = { input, detector: "ffmpeg scdet", threshold, cuts_seconds: cuts, advisory: true, note: "Scene detection is suggestive; inspect gradual transitions and every proposed boundary." };
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(out);
