#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { spawn } from "node:child_process";

function usage() {
  console.log(`Usage:
  node cutout-contact-sheet.mjs --manifest <manifest.json> --output <directory>

Manifest fields:
  name       Optional audit name
  segments   Ordered { timeline_start, duration, source } rows

The source path may be absolute or relative to the manifest directory.`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") return { help: true };
    if (!value.startsWith("--")) throw new Error(`Unexpected argument: ${value}`);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for ${value}`);
    args[value.slice(2)] = next;
    index += 1;
  }
  if (!args.manifest || !args.output) throw new Error("--manifest and --output are required");
  return args;
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function validateSegments(segments) {
  if (!Array.isArray(segments) || segments.length === 0) throw new Error("Manifest needs at least one segment");
  const ordered = [...segments].sort((a, b) => a.timeline_start - b.timeline_start);
  let cursor = 0;
  for (const [index, segment] of ordered.entries()) {
    for (const field of ["timeline_start", "duration"]) {
      if (!Number.isFinite(segment[field])) throw new Error(`Segment ${index} has invalid ${field}`);
    }
    if (segment.duration <= 0 || typeof segment.source !== "string" || !segment.source) {
      throw new Error(`Segment ${index} needs a positive duration and source`);
    }
    if (Math.abs(segment.timeline_start - cursor) > 0.001) {
      throw new Error(`Timeline gap or overlap before segment ${index}: expected ${cursor}, got ${segment.timeline_start}`);
    }
    cursor = segment.timeline_start + segment.duration;
  }
  return { ordered, duration: cursor };
}

function findSegment(segments, second, totalDuration) {
  const sampleTime = Math.min(second, Math.max(0, totalDuration - 1 / 30));
  const segment = segments.find((candidate, index) => {
    const end = candidate.timeline_start + candidate.duration;
    return sampleTime >= candidate.timeline_start - 0.0005 &&
      (sampleTime < end - 0.0005 || index === segments.length - 1);
  });
  if (!segment) throw new Error(`No segment covers timeline second ${second}`);
  return { segment, localTime: Math.max(0, sampleTime - segment.timeline_start) };
}

async function makeFrame({ source, localTime, label, output }) {
  const width = 270;
  const height = 480;
  const filter = [
    `[0:v]select='gte(t\\,${localTime.toFixed(6)})',setpts=PTS-STARTPTS,format=rgba,scale=${width}:${height}:flags=lanczos,split=2[subject][masksrc]`,
    `[masksrc]alphaextract,dilation,dilation,dilation[wide]`,
    `[2:v][wide]alphamerge[outline]`,
    `[1:v][outline]overlay[outlined]`,
    `[outlined][subject]overlay=shortest=1,drawtext=font='Hiragino Sans':text='${label}':fontcolor=white:fontsize=22:borderw=3:bordercolor=black:x=12:y=12[out]`,
  ].join(";");
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    // VP9 alpha is not reliable when input seeking starts between keyframes.
    // Decode from the segment head and select by presentation timestamp.
    "-c:v", "libvpx-vp9", "-i", source,
    "-f", "lavfi", "-i", `color=c=black:s=${width}x${height}:r=1`,
    "-f", "lavfi", "-i", `color=c=white:s=${width}x${height}:r=1`,
    "-filter_complex", filter,
    "-map", "[out]", "-frames:v", "1", output,
  ]);
}

async function makeSheet(framePaths, output) {
  const columns = 5;
  const rows = Math.ceil(framePaths.length / columns);
  const inputs = framePaths.flatMap((frame) => ["-i", frame]);
  const layout = framePaths.map((_, index) => `${(index % columns) * 270}_${Math.floor(index / columns) * 480}`).join("|");
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    ...inputs,
    "-filter_complex", `xstack=inputs=${framePaths.length}:layout=${layout}:fill=black[out]`,
    "-map", "[out]", "-frames:v", "1", output,
  ]);
  return { columns, rows, width: columns * 270, height: rows * 480 };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();
  const manifestPath = resolve(args.manifest);
  const outputDir = resolve(args.output);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const { ordered, duration } = validateSegments(manifest.segments);
  const resolvedSegments = ordered.map((segment) => ({
    ...segment,
    source: isAbsolute(segment.source) ? segment.source : resolve(dirname(manifestPath), segment.source),
  }));
  const seconds = Array.from({ length: Math.ceil(duration) }, (_, index) => index);
  const framesDir = resolve(outputDir, "frames");
  await mkdir(framesDir, { recursive: true });

  const samples = [];
  for (const second of seconds) {
    const { segment, localTime } = findSegment(resolvedSegments, second, duration);
    const output = resolve(framesDir, `second-${String(second).padStart(3, "0")}.png`);
    await makeFrame({ source: segment.source, localTime, label: `${second}s`, output });
    samples.push({
      timeline_second: second,
      segment_source: segment.source,
      segment_timeline_start: segment.timeline_start,
      local_seconds: Number(localTime.toFixed(6)),
      frame: output,
    });
    process.stdout.write(`sampled ${second}s\n`);
  }

  const sheets = [];
  for (let start = 0; start < samples.length; start += 25) {
    const group = samples.slice(start, start + 25);
    const end = group.at(-1).timeline_second;
    const output = resolve(outputDir, `contact-sheet-${String(group[0].timeline_second).padStart(3, "0")}-${String(end).padStart(3, "0")}.png`);
    const geometry = await makeSheet(group.map((sample) => sample.frame), output);
    sheets.push({ start_second: group[0].timeline_second, end_second: end, output, ...geometry });
  }

  const receipt = {
    schema_version: 1,
    name: manifest.name ?? basename(manifestPath, ".json"),
    created_at: new Date().toISOString(),
    manifest: manifestPath,
    duration_seconds: duration,
    sampling: "one frame at every integer timeline second",
    review_status: "pending_human_review",
    acceptance_note: "Coverage generation is automatic; visual matte acceptance is not.",
    samples,
    sheets,
  };
  await writeFile(resolve(outputDir, "qa-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`Wrote ${samples.length} samples and ${sheets.length} contact sheets to ${outputDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
