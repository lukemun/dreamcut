/** Cache alpha-only frames, never a styled outline or timeline mutation. */
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { readCustomCutouts } from "../src/lib/local-store/custom-cutouts";
import { projectDir } from "../src/lib/local-store/paths";
import { writeJsonFileAtomic } from "../src/lib/local-store/atomic-json";

const [projectId, cutoutId] = process.argv.slice(2);
if (!projectId || !cutoutId) throw new Error("Usage: tsx scripts/prepare-outline-mask.ts <project> <cutout-id>");
const receipt = readCustomCutouts(projectId).cutouts.find((item) => item.cutout_id === cutoutId);
if (!receipt || receipt.scratchpad_treatment) throw new Error("Choose an original, unstyled cutout receipt");
const media = path.resolve(projectDir(projectId), "media");
const source = path.resolve(media, receipt.output_relative_path);
if (!source.startsWith(media + path.sep)) throw new Error("Cutout escapes project media");
const hash = createHash("sha256").update(readFileSync(source)).digest("hex");
const relative = `outline-masks/${hash}`;
const output = path.join(media, relative);
mkdirSync(output, { recursive: true });
execFileSync("ffmpeg", ["-v", "error", "-y", "-c:v", "libvpx-vp9", "-i", source,
  "-vf", "format=rgba,lutrgb=r=255:g=255:b=255", "-fps_mode", "passthrough", path.join(output, "%05d.png")], { stdio: "inherit" });
const count = readdirSync(output).filter((name) => /^\d{5}\.png$/.test(name)).length;
const packets = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time", "-of", "json", source], { encoding: "utf8" }));
const timestamps = packets.packets.map((packet: { pts_time: string }) => Number(packet.pts_time)) as number[];
if (!count || count !== timestamps.length || timestamps.some((time, index) => !Number.isFinite(time) || (index > 0 && time <= timestamps[index - 1]!))) throw new Error("Mask frames do not match source timestamps");
const mask = { source_url: `/api/projects/${projectId}/media/${relative}`, frame_count: count,
  fps: receipt.frame_rate, width: receipt.width, height: receipt.height, source_sha256: hash, timestamps };
writeJsonFileAtomic(path.join(output, "manifest.json"), mask);
console.log(JSON.stringify(mask));
