import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { readTimeline } from "@/lib/local-store/store";
import {
  classifyUniformBlackRgb,
  sha256,
  walkthroughBoundarySamples,
} from "@/lib/qc/walkthrough-boundary-integrity";

const projectId = process.argv[2];
if (!projectId || projectId.startsWith("--")) {
  throw new Error("usage: pnpm walkthrough-boundary-integrity <project-id> [--base http://127.0.0.1:3123]");
}
const baseIndex = process.argv.indexOf("--base");
const base = baseIndex >= 0 ? process.argv[baseIndex + 1] : "http://127.0.0.1:3123";
const projectRoot = path.join(process.env.TIMELINE_PROJECTS_DIR ?? "projects", projectId);
const timelinePath = path.join(projectRoot, "timeline.json");
const timelineBody = fs.readFileSync(timelinePath);
const samples = walkthroughBoundarySamples(readTimeline(projectId).elements);
if (samples.length === 0) throw new Error("No product visual boundaries or contacts were found to inspect");

const outDir = path.join(projectRoot, "review", "walkthrough-boundary-frames");
fs.mkdirSync(outDir, { recursive: true });
execFileSync(
  process.execPath,
  [
    "--import", "tsx",
    "scripts/frame-state.ts",
    projectId,
    "--at", samples.map((sample) => sample.atSeconds.toFixed(3)).join(","),
    "--base", base ?? "http://127.0.0.1:3123",
    "--out", outDir,
  ],
  { cwd: process.cwd(), stdio: "inherit" },
);

const results = samples.map((sample) => {
  const label = sample.atSeconds.toFixed(3).replace(".", "_");
  const stillPath = path.join(outDir, `${label}s.png`);
  const stillBody = fs.readFileSync(stillPath);
  const rgb = execFileSync("ffmpeg", [
    "-v", "error",
    "-i", stillPath,
    "-vf", "crop=iw:ih/2:0:0,scale=270:-1",
    "-f", "rawvideo",
    "-pix_fmt", "rgb24",
    "-",
  ], { maxBuffer: 1024 * 1024 * 64 });
  return {
    ...sample,
    ...classifyUniformBlackRgb(rgb),
    still_path: path.relative(projectRoot, stillPath),
    still_sha256: sha256(stillBody),
  };
});
const report = {
  schema_version: 1,
  project_id: projectId,
  timeline_sha256: sha256(timelineBody),
  verdict: results.some((sample) => sample.black) ? "FAIL" : "PASS",
  samples: results,
};
const reportPath = path.join(projectRoot, "review", "walkthrough-boundary-integrity.json");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(reportPath);
if (report.verdict !== "PASS") process.exitCode = 1;
