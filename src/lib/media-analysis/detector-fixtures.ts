import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { readDetectorFixtureManifest } from "./detector-promotion";

function sha256File(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function downloadPinned(url: string, destination: string, expectedSha: string): Promise<void> {
  if (fs.existsSync(destination) && sha256File(destination) === expectedSha) return;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Fixture download failed (${response.status}): ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expectedSha) throw new Error(`Fixture source SHA-256 mismatch for ${url}: expected ${expectedSha}, got ${actual}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, bytes, { flag: "wx" });
  fs.renameSync(temporary, destination);
}

function ffmpeg(args: string[]): void {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "pipe" });
}

export async function generateDetectorFixtures(options: { manifestPath: string; fixtureRoot: string }): Promise<{
  fixture_root: string;
  files: Record<string, { sha256: string; bytes: number }>;
}> {
  const manifest = readDetectorFixtureManifest(options.manifestPath);
  const root = path.resolve(options.fixtureRoot);
  fs.mkdirSync(root, { recursive: true });
  for (const source of manifest.sources) await downloadPinned(source.url, path.join(root, source.file), source.sha256);
  const portrait = path.join(root, "sources/portrait.jpg");
  const group = path.join(root, "sources/group.jpg");
  const generated = path.join(root, "generated");
  fs.mkdirSync(generated, { recursive: true });

  // Explicit pixel transforms and stripped metadata keep each fixture recipe
  // deterministic for a given pinned FFmpeg build.
  ffmpeg(["-i", group, "-vf", "drawbox=x=iw*0.68:y=ih*0.58:w=iw*0.27:h=ih*0.32:color=black:t=fill", "-frames:v", "1", "-map_metadata", "-1", "-fflags", "+bitexact", path.join(generated, "group-occluded.png")]);
  ffmpeg(["-i", portrait, "-vf", "transpose=clock", "-frames:v", "1", "-map_metadata", "-1", "-fflags", "+bitexact", path.join(generated, "portrait-clockwise.png")]);
  ffmpeg(["-i", portrait, "-i", group, "-filter_complex", "[1:v]scale=1026:1280[g];[0:v][g]blend=all_mode=normal:all_opacity=0.10", "-frames:v", "1", "-map_metadata", "-1", "-fflags", "+bitexact", path.join(generated, "portrait-dissolve.png")]);
  ffmpeg(["-f", "lavfi", "-i", "color=c=0x777777:s=1026x1280", "-frames:v", "1", "-map_metadata", "-1", "-fflags", "+bitexact", path.join(generated, "negative-neutral.png")]);
  for (let index = 0; index < 8; index += 1) fs.copyFileSync(portrait, path.join(generated, `longer-${String(index).padStart(2, "0")}.jpg`));

  const files: Record<string, { sha256: string; bytes: number }> = {};
  for (const relativePath of [...new Set(manifest.frames.map((frame) => frame.file))].sort()) {
    const filePath = path.join(root, relativePath);
    const stat = fs.statSync(filePath);
    files[relativePath] = { sha256: sha256File(filePath), bytes: stat.size };
  }
  return { fixture_root: root, files };
}
