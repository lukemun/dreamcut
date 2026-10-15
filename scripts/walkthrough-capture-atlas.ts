import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const projectId = process.argv[2];
if (!projectId) throw new Error("Usage: pnpm walkthrough-capture-atlas <project-id>");

const editorRoot = path.resolve(__dirname, "..");
const projectsRoot = process.env.TIMELINE_PROJECTS_DIR
  ? path.resolve(process.env.TIMELINE_PROJECTS_DIR)
  : path.join(editorRoot, "projects");
const projectRoot = path.join(projectsRoot, projectId);
const manifestPath = fs.existsSync(path.join(projectRoot, "source-manifest.json"))
  ? path.join(projectRoot, "source-manifest.json")
  : path.join(projectRoot, "preprocess", "source-manifest.json");
const qualificationPath = path.join(projectRoot, "review", "source-qualification.json");
const outputRoot = path.join(projectRoot, "review", "capture-frame-atlas");
const atlasPath = path.join(projectRoot, "review", "capture-frame-atlas.json");
const maxSampleGapSeconds = 0.5;

if (!fs.existsSync(manifestPath)) throw new Error(`Missing source manifest: ${manifestPath}`);
if (!fs.existsSync(qualificationPath)) throw new Error(`Missing source qualification: ${qualificationPath}`);

const manifestBody = fs.readFileSync(manifestPath);
const qualificationBody = fs.readFileSync(qualificationPath);
const manifest = JSON.parse(manifestBody.toString("utf8")) as {
  project_id?: string;
  sources?: Array<{ id?: string; path?: string; duration_seconds?: number }>;
};
const qualification = JSON.parse(qualificationBody.toString("utf8")) as {
  project_id?: string;
  visual_checkpoints?: Array<{
    id?: string;
    source_id?: string;
    source_start_seconds?: number;
    source_end_seconds?: number;
  }>;
};

if (manifest.project_id !== projectId || qualification.project_id !== projectId) {
  throw new Error("Project id differs across the requested project, source manifest, and qualification.");
}

const sources = new Map((manifest.sources ?? []).map((source) => [source.id, source]));
const checkpoints = qualification.visual_checkpoints ?? [];
if (checkpoints.length === 0) throw new Error("Source qualification has no visual checkpoints.");

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });

const atlasCheckpoints = checkpoints.map((checkpoint) => {
  if (
    !checkpoint.id
    || !checkpoint.source_id
    || typeof checkpoint.source_start_seconds !== "number"
    || typeof checkpoint.source_end_seconds !== "number"
    || checkpoint.source_end_seconds <= checkpoint.source_start_seconds
  ) {
    throw new Error(`Invalid visual checkpoint: ${JSON.stringify(checkpoint)}`);
  }
  const source = sources.get(checkpoint.source_id);
  if (!source?.path || typeof source.duration_seconds !== "number") {
    throw new Error(`${checkpoint.id}: source ${checkpoint.source_id} is absent or incomplete in the manifest.`);
  }
  if (checkpoint.source_end_seconds > source.duration_seconds + 0.001) {
    throw new Error(`${checkpoint.id}: interval exceeds the source duration.`);
  }
  const sourcePath = path.join(projectRoot, source.path);
  if (!fs.existsSync(sourcePath)) throw new Error(`${checkpoint.id}: missing source media ${sourcePath}`);

  const times = sampleTimes(
    checkpoint.source_start_seconds,
    checkpoint.source_end_seconds,
    maxSampleGapSeconds,
  );
  const checkpointDir = path.join(outputRoot, safeSegment(checkpoint.id));
  fs.mkdirSync(checkpointDir, { recursive: true });
  const frames = times.map((sourceSeconds, index) => {
    const filename = `${String(index + 1).padStart(3, "0")}-${Math.round(sourceSeconds * 1000)}ms.jpg`;
    const outputPath = path.join(checkpointDir, filename);
    const result = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", sourceSeconds.toFixed(6),
      "-i", sourcePath,
      "-frames:v", "1",
      "-q:v", "2",
      outputPath,
    ], { encoding: "utf8" });
    if (result.status !== 0 || !fs.existsSync(outputPath)) {
      throw new Error(`${checkpoint.id}: frame extraction failed at ${sourceSeconds}s: ${result.stderr}`);
    }
    return {
      source_seconds: Number(sourceSeconds.toFixed(6)),
      path: path.relative(projectRoot, outputPath),
      sha256: sha256(fs.readFileSync(outputPath)),
    };
  });

  return {
    id: checkpoint.id,
    source_id: checkpoint.source_id,
    source_start_seconds: checkpoint.source_start_seconds,
    source_end_seconds: checkpoint.source_end_seconds,
    frames,
  };
});

const atlas = {
  schema_version: 1,
  project_id: projectId,
  generated_at: new Date().toISOString(),
  source_manifest_sha256: sha256(manifestBody),
  source_qualification_sha256: sha256(qualificationBody),
  max_sample_gap_seconds: maxSampleGapSeconds,
  purpose: "Dense post-capture editorial index for vertical crop planning and complete teaching-surface review; frames are evidence derived from the continuous source, not replacement footage.",
  checkpoints: atlasCheckpoints,
};
fs.writeFileSync(atlasPath, `${JSON.stringify(atlas, null, 2)}\n`);
console.log(JSON.stringify({
  project_id: projectId,
  atlas: path.relative(projectRoot, atlasPath),
  checkpoints: atlasCheckpoints.length,
  frames: atlasCheckpoints.reduce((total, checkpoint) => total + checkpoint.frames.length, 0),
  max_sample_gap_seconds: maxSampleGapSeconds,
}, null, 2));

function sampleTimes(start: number, end: number, gap: number): number[] {
  const last = Math.max(start, end - 0.001);
  const times = [start];
  for (let time = start + gap; time < last - 0.001; time += gap) times.push(time);
  times.push((start + end) / 2, last);
  return [...new Set(times.map((time) => Number(time.toFixed(6))))].sort((a, b) => a - b);
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "checkpoint";
}

function sha256(body: Buffer | string): string {
  return crypto.createHash("sha256").update(body).digest("hex");
}
