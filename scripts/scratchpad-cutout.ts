/** Bake a Scratchpad border into a cataloged alpha derivative; never edit a timeline. */
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { appendCustomCutout, readCustomCutouts } from "../src/lib/local-store/custom-cutouts";
import { projectDir, projectMediaDir } from "../src/lib/local-store/paths";
import { requireMattingPython } from "../src/lib/media-analysis/matting-runtime";

const [project, parentId, widthText = "12", bottomText = "1", cleanupMode = "small-holes"] = process.argv.slice(2);
const fillAllEnclosed = cleanupMode === "fill-all" || cleanupMode === "fill-all-largest";
const keepLargestComponent = cleanupMode === "fill-all-largest";
if (!fillAllEnclosed && cleanupMode !== "small-holes") throw new Error("Cleanup mode must be small-holes, fill-all, or fill-all-largest");
const bottom = Number(bottomText);
if (!Number.isFinite(bottom) || bottom < 0.5 || bottom > 1) throw new Error("Bottom boundary must be between 0.5 and 1 of source height");
const width = Number(widthText);
if (!project || !parentId || !Number.isInteger(width) || width < 1 || width > 32) {
  throw new Error("Usage: tsx scripts/scratchpad-cutout.ts <project> <parent-cutout-id> [width:1..32] [bottom:0.5..1] [small-holes|fill-all|fill-all-largest]");
}
const parent = readCustomCutouts(project).cutouts.find((entry) => entry.cutout_id === parentId);
if (!parent) throw new Error("Unknown parent cutout");
if (parent.scratchpad_treatment) throw new Error("Use the unstyled parent to avoid a doubled border");
const id = randomUUID();
const relative = `cutouts/scratchpad-${id}.webm`;
const input = path.join(projectMediaDir(project), parent.output_relative_path);
const source = path.join(projectMediaDir(project), parent.source_relative_path);
const evidence = `instruments/custom-cutouts/${id}`;
const cleanedMasks = path.join(projectDir(project), evidence, "masks");
const cleanupArgs = [
  "scripts/matting/clean_mask_sequence.py", "--input", path.join(projectDir(project), parent.evidence_directory, "masks"), "--output", cleanedMasks,
];
if (fillAllEnclosed) cleanupArgs.push("--fill-all-enclosed");
if (keepLargestComponent) cleanupArgs.push("--largest-component");
const cleanup = spawnSync(requireMattingPython(), cleanupArgs, { encoding: "utf8" });
if (cleanup.status !== 0) throw new Error(`Mask cleanup failed: ${cleanup.stderr}`);
const maskFacts = JSON.parse(cleanup.stdout);
if (maskFacts.frame_count !== parent.frame_count || maskFacts.frames_with_remaining_holes !== 0) throw new Error(`Matte requires review: ${cleanup.stdout}`);
const masks = path.join(cleanedMasks, "%05d.png");
const output = path.join(projectMediaDir(project), relative);
if (!fs.existsSync(input)) throw new Error("Parent cutout media is missing");
if (!fs.existsSync(source)) throw new Error("Parent source media is missing");
if (!fs.existsSync(masks.replace("%05d", "00000"))) throw new Error("Parent matte frames are missing");
const sigma = Math.max(0.75, Math.min(4, width * 0.375));
// Reserve transparent overscan on every edge, including camera-cropped torso
// and arms. An outline cannot grow past a full-frame subject without this.
const inset = width + 8;
const innerWidth = Math.floor((parent.width - 2 * inset) / 2) * 2;
const innerHeight = Math.floor((parent.height * innerWidth / parent.width) / 2) * 2;
if (innerWidth < 2 || innerHeight < 2 || innerHeight > parent.height - 2) throw new Error("Source is too small for this outline width");
const filters = [
  `[0:v]fps=${parent.frame_rate},trim=end_frame=${parent.frame_count},setpts=N/(${parent.frame_rate}*TB),format=rgb24[rgb]`,
  `[1:v]trim=end_frame=${parent.frame_count},setpts=N/(${parent.frame_rate}*TB),scale=${parent.width}:${parent.height}:flags=lanczos,format=gray,boxblur=1,drawbox=x=0:y=${Math.floor(parent.height * bottom)}:w=iw:h=ih:color=black:t=fill[mask]`,
  `[rgb][mask]alphamerge,format=rgba,scale=${innerWidth}:${innerHeight}:flags=lanczos,pad=${parent.width}:${parent.height}:(ow-iw)/2:(oh-ih)/2:color=black@0,split[subject][outlineSource]`,
  "[outlineSource]alphaextract[outline]",
  `[outline]gblur=sigma=${sigma},lut=y='clip((val/255*8-3.5)*255,0,255)',${Array(width).fill("dilation").join(",")},gblur=sigma=${Math.max(0.35, Math.min(1.25, width * 0.08))}[wide]`,
  `[2:v]format=rgb24[white]`,
  "[white][wide]alphamerge[border]",
  "[border][subject]overlay=shortest=0:format=auto,format=yuva420p[out]",
].join(";");
const result = spawnSync("ffmpeg", [
  "-v", "error", "-n",
  "-ss", String(parent.source_interval_seconds[0]), "-t", String(parent.output_duration_seconds), "-i", source,
  "-framerate", String(parent.frame_rate), "-start_number", "0", "-i", masks,
  "-f", "lavfi", "-i", `color=white:s=${parent.width}x${parent.height}:r=${parent.frame_rate}:d=${parent.output_duration_seconds}`,
  "-filter_complex", filters, "-map", "[out]", "-frames:v", String(parent.frame_count), "-fps_mode", "passthrough",
  "-c:v", "libvpx-vp9", "-lossless", "1", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0",
  "-row-mt", "1", "-cpu-used", "4", "-threads", "4", "-metadata:s:v:0", "alpha_mode=1", "-an", output,
], { stdio: "inherit" });
if (result.status !== 0) throw new Error("Scratchpad encoding failed");
const probe = spawnSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=width,height,nb_read_frames:stream_tags=alpha_mode:format=duration", "-of", "json", output], { encoding: "utf8" });
if (probe.status !== 0) throw new Error("Output probe failed");
const facts = JSON.parse(probe.stdout);
const video = facts.streams[0];
if (video.width !== parent.width || video.height !== parent.height || Number(video.nb_read_frames) !== parent.frame_count || video.tags?.ALPHA_MODE !== "1") throw new Error("Derivative dimensions, frame count or alpha failed verification");
const alphaProbe = spawnSync("ffmpeg", [
  "-v", "info", "-c:v", "libvpx-vp9", "-ss", String(parent.output_duration_seconds / 2), "-i", output,
  "-vf", "alphaextract,signalstats,metadata=print:file=-", "-frames:v", "1", "-f", "null", "-",
], { encoding: "utf8" });
if (alphaProbe.status !== 0) throw new Error("Derivative alpha-plane probe failed");
const alphaText = `${alphaProbe.stdout}\n${alphaProbe.stderr}`;
const alphaMin = Number(alphaText.match(/lavfi\.signalstats\.YMIN=(\d+)/)?.[1]);
const alphaMax = Number(alphaText.match(/lavfi\.signalstats\.YMAX=(\d+)/)?.[1]);
if (!(alphaMin < 255 && alphaMax > 0)) throw new Error("Derivative alpha plane is opaque or empty");
// Test the actual encoded alpha rather than trusting the overscan recipe.
for (const at of [0, parent.output_duration_seconds / 2, Math.max(0, parent.output_duration_seconds - 2 / parent.frame_rate)]) {
  const edgeProbe = spawnSync("ffmpeg", ["-v", "error", "-c:v", "libvpx-vp9", "-ss", String(at), "-i", output,
    "-vf", "alphaextract", "-frames:v", "1", "-pix_fmt", "gray", "-f", "rawvideo", "-"], { maxBuffer: parent.width * parent.height * 2 });
  const alpha = edgeProbe.stdout;
  if (edgeProbe.status !== 0 || alpha.length !== parent.width * parent.height) throw new Error("Perimeter probe failed");
  for (let x = 0; x < parent.width; x++) if (alpha[x] || alpha[(parent.height - 1) * parent.width + x]) throw new Error("Scratchpad border touches top or bottom frame edge");
  for (let y = 0; y < parent.height; y++) if (alpha[y * parent.width] || alpha[y * parent.width + parent.width - 1]) throw new Error("Scratchpad border touches side frame edge");
}
const hash = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
// Alpha needs VP9 rather than the opaque H.264 proxy recipe. Register the pair
// only after decoding both the cadence and actual transparency of the proxy.
const previewRelative = `cutouts/scratchpad-${id}-preview.webm`;
const previewOutput = path.join(projectMediaDir(project), previewRelative);
const previewScale = Math.min(1, 1280 / Math.max(parent.width,parent.height), 720 / Math.min(parent.width,parent.height));
const previewWidth = Math.max(2,Math.floor(parent.width*previewScale/2)*2);
const previewHeight = Math.max(2,Math.floor(parent.height*previewScale/2)*2);
const previewResult = spawnSync("ffmpeg", ["-v", "error", "-n", "-c:v", "libvpx-vp9", "-i", output,
  "-vf", `scale=${previewWidth}:${previewHeight}:flags=area`, "-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", "-g", "30",
  "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-row-mt", "1", "-cpu-used", "5", "-threads", "4", "-an", previewOutput], { stdio: "inherit" });
if (previewResult.status !== 0) throw new Error("Alpha preview encoding failed");
const previewProbe = spawnSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=width,height,nb_read_frames:stream_tags=alpha_mode:format=duration", "-of", "json", previewOutput], { encoding: "utf8" });
const previewFacts = JSON.parse(previewProbe.stdout);
if (previewProbe.status !== 0 || Number(previewFacts.streams[0]?.nb_read_frames) !== parent.frame_count || Math.abs(Number(previewFacts.format.duration) - Number(facts.format.duration)) > 1 / parent.frame_rate) throw new Error("Alpha preview cadence mismatch");
for (const at of [0, parent.output_duration_seconds / 2, Math.max(0, parent.output_duration_seconds - 2 / parent.frame_rate)]) {
  const alpha = spawnSync("ffmpeg", ["-v", "error", "-c:v", "libvpx-vp9", "-ss", String(at), "-i", previewOutput, "-vf", "alphaextract", "-frames:v", "1", "-pix_fmt", "gray", "-f", "rawvideo", "-"], { maxBuffer: previewWidth * previewHeight * 2 });
  if (alpha.status !== 0 || alpha.stdout.length !== previewWidth * previewHeight || !alpha.stdout.includes(0) || !alpha.stdout.includes(255)) throw new Error("Preview transparency validation failed");
}
const { preparation: _preparation, preview: _preview, ...rawParent } = parent;
const receipt = {
  ...rawParent, cutout_id: id, output_relative_path: relative, evidence_directory: evidence,
  mask_postprocessing: { fill_small_enclosed_holes: true as const, max_hole_area_ratio: 0.001 },
  output_duration_seconds: Number(facts.format.duration), created_at: new Date().toISOString(),
  preview: { relative_path: previewRelative, sha256: hash(previewOutput), frame_count: parent.frame_count, duration_seconds: Number(previewFacts.format.duration), width: previewWidth, height: previewHeight, recipe: "vp9-alpha-area-crf30-g30/v1" },
  scratchpad_treatment: {
    recipe_id: "scratchpad-alpha-outline/v1" as const, parent_cutout_id: parentId,
    parent_sha256: hash(input), output_sha256: hash(output), outline_width: width,
    alpha_range: [alphaMin, alphaMax] as [number, number],
    full_perimeter: true as const,
    ...(fillAllEnclosed ? { interior_holes_filled: true as const } : {}),
    ...(keepLargestComponent ? { largest_component_only: true as const } : {}),
    content_inset_pixels: inset,
    bottom_boundary_ratio: bottom,
  },
};
appendCustomCutout(project, receipt);
console.log(JSON.stringify(receipt));
