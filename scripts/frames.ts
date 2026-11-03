import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const projectId = args[0];
const at = args[args.indexOf("--at") + 1];
const explicitInput = args.includes("--input") ? args[args.indexOf("--input") + 1] : null;
if (!projectId || !at) throw new Error("usage: pnpm frames <projectId> --at 1.2,4.0 [--input file.mp4]");
const root = process.env.TIMELINE_PROJECTS_DIR ?? "projects";
const renderDir = path.join(root, projectId, "renders");
const input = explicitInput ?? readdirSync(renderDir)
  .filter((name) => name.endsWith(".mp4"))
  .map((name) => path.join(renderDir, name))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
if (!input) throw new Error(`No render found for ${projectId}.`);
const outDir = path.join(root, projectId, "instruments", "frames");
mkdirSync(outDir, { recursive: true });
for (const value of at.split(",").map(Number)) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid frame time: ${value}`);
  const output = path.join(outDir, `${value.toFixed(3).replace(".", "_")}s.png`);
  execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", String(value), "-i", input, "-frames:v", "1", "-compression_level", "1", output], { stdio: "inherit" });
  console.log(output);
}
