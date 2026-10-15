import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

type GoldPoint = { frame: number; time_seconds: number; upper_y_px: number | null; lower_y_px: number | null };
type Observation = {
  frame: number;
  phase: "contact" | "opening" | "clear";
  upper_hand_visible: boolean;
  upper_hand_y_px: number | null;
  lower_hand_visible: boolean;
  lower_hand_y_px: number | null;
  confidence: number;
  evidence: string;
};
type InvocationResult = {
  model: string;
  frame: number;
  started_at: string;
  finished_at: string;
  wall_ms: number;
  exit_code: number;
  observation: Observation | null;
  parse_error: string | null;
};

const argv = process.argv.slice(2);
const option = (name: string, fallback?: string) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : fallback;
};
const projectId = option("project", "book-marketing-last-take-effect")!;
const models = option("models", "gpt-5.6-luna,gpt-5.6-terra")!.split(",").filter(Boolean);
const parallel = Number(option("parallel", "5"));
if (!Number.isInteger(parallel) || parallel < 1) throw new Error("--parallel must be a positive integer");

const projectDir = path.resolve(process.env.TIMELINE_PROJECTS_DIR || "projects", projectId);
const source = path.join(projectDir, "media", "performance-last-complete-v2.mp4");
const evalDir = path.join(projectDir, "preprocess", "model-eval", "hand-swipe-v1");
const framesDir = path.join(evalDir, "frames");
const schemaFile = path.join(evalDir, "observation.schema.json");

// Accepted grip-line-v2 coordinates transformed from the 1080x1920 master into the
// native 1280x720 source. These labels grade model substitution; they are not catalog metadata.
const gold: GoldPoint[] = [
  { frame: 156, time_seconds: 5.2, upper_y_px: 203, lower_y_px: 244 },
  { frame: 157, time_seconds: 5.233333, upper_y_px: 193, lower_y_px: 296 },
  { frame: 158, time_seconds: 5.266667, upper_y_px: 71, lower_y_px: 419 },
  { frame: 159, time_seconds: 5.3, upper_y_px: null, lower_y_px: 610 },
  { frame: 160, time_seconds: 5.333333, upper_y_px: null, lower_y_px: null },
];

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    frame: { type: "integer" },
    phase: { type: "string", enum: ["contact", "opening", "clear"] },
    upper_hand_visible: { type: "boolean" },
    upper_hand_y_px: { type: ["number", "null"] },
    lower_hand_visible: { type: "boolean" },
    lower_hand_y_px: { type: ["number", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    evidence: { type: "string" },
  },
  required: [
    "frame", "phase", "upper_hand_visible", "upper_hand_y_px",
    "lower_hand_visible", "lower_hand_y_px", "confidence", "evidence",
  ],
};

const promptFor = (point: GoldPoint) => `
Inspect only the attached native source frame from a 1280x720 landscape video. This is a raw L1
measurement task. Do not infer an editing use, future motion, or effect. Do not use tools.

Frame identity: zero-based frame ${point.frame}, timestamp ${point.time_seconds}s at 30 fps.

The performer is moving one hand toward the TOP image boundary and the other toward the BOTTOM
image boundary to open a horizontal slit. Measure in source-image pixels, where y=0 is the top row
and y=719 is the bottom row.

- upper_hand_y_px: the y coordinate of the upper hand/fingertip edge that defines the upper slit edge.
- lower_hand_y_px: the y coordinate of the lower hand/fingertip edge that defines the lower slit edge.
- If that hand has cleared its relevant image boundary, set visible=false and its coordinate=null.
- phase is contact if the hands are still close together, opening if separating, and clear only if
  both relevant hands have cleared their image boundaries.
- Report only what is visible in this one frame. Keep evidence to one short visual sentence.
`;

const run = (command: string, args: string[], stdoutFile?: string, stderrFile?: string) =>
  new Promise<{ code: number; wall_ms: number }>((resolve) => {
    const started = performance.now();
    const child = spawn(command, args, { cwd: path.resolve("."), stdio: ["ignore", "pipe", "pipe"] });
    const stdout = stdoutFile ? fs.createWriteStream(stdoutFile) : process.stdout;
    const stderr = stderrFile ? fs.createWriteStream(stderrFile) : process.stderr;
    child.stdout.pipe(stdout);
    child.stderr.pipe(stderr);
    child.on("close", (code) => {
      if (stdoutFile) (stdout as fs.WriteStream).end();
      if (stderrFile) (stderr as fs.WriteStream).end();
      resolve({ code: code ?? 1, wall_ms: Math.round(performance.now() - started) });
    });
  });

async function pool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  }));
}

async function main() {
  if (!fs.existsSync(source)) throw new Error(`Missing source: ${source}`);
  fs.mkdirSync(framesDir, { recursive: true });
  fs.writeFileSync(schemaFile, `${JSON.stringify(schema, null, 2)}\n`);

  const extractionStarted = performance.now();
  for (const point of gold) {
    const frameFile = path.join(framesDir, `frame-${point.frame}.jpg`);
    if (!fs.existsSync(frameFile)) {
      const result = await run("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-i", source,
        "-vf", `select=eq(n\\,${point.frame})`, "-vsync", "0", "-frames:v", "1", "-y", frameFile,
      ]);
      if (result.code !== 0) throw new Error(`ffmpeg failed for frame ${point.frame}`);
    }
  }
  const extractionMs = Math.round(performance.now() - extractionStarted);

  const tasks = models.flatMap((model) => gold.map((point) => ({ model, point })));
  const results: InvocationResult[] = [];
  const fanoutStarted = performance.now();
  await pool(tasks, parallel, async ({ model, point }) => {
    const safeModel = model.replace(/[^a-zA-Z0-9._-]/g, "_");
    const modelDir = path.join(evalDir, safeModel);
    fs.mkdirSync(modelDir, { recursive: true });
    const imageFile = path.join(framesDir, `frame-${point.frame}.jpg`);
    const outputFile = path.join(modelDir, `frame-${point.frame}.json`);
    const eventFile = path.join(modelDir, `frame-${point.frame}.events.jsonl`);
    const errorFile = path.join(modelDir, `frame-${point.frame}.stderr.log`);
    const startedAt = new Date().toISOString();
    const invocation = await run("codex", [
      "exec", "--ephemeral", "--ignore-user-config", "--skip-git-repo-check",
      "-s", "read-only", "-m", model, "-c", "model_reasoning_effort=medium",
      "--output-schema", schemaFile, "--json", "-o", outputFile, "-i", imageFile,
      "--", promptFor(point),
    ], eventFile, errorFile);
    let observation: Observation | null = null;
    let parseError: string | null = null;
    try {
      observation = JSON.parse(fs.readFileSync(outputFile, "utf8"));
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
    results.push({
      model, frame: point.frame, started_at: startedAt, finished_at: new Date().toISOString(),
      wall_ms: invocation.wall_ms, exit_code: invocation.code, observation, parse_error: parseError,
    });
    console.log(`${model} frame ${point.frame}: ${invocation.code === 0 && observation ? "ok" : "failed"} ${invocation.wall_ms}ms`);
  });
  const fanoutMs = Math.round(performance.now() - fanoutStarted);

  const graded = models.map((model) => {
    const rows = results.filter((result) => result.model === model).map((result) => {
      const point = gold.find((entry) => entry.frame === result.frame)!;
      const observation = result.observation as Observation | null;
      const coordinateErrors: number[] = [];
      let clearStateErrors = 0;
      for (const side of ["upper", "lower"] as const) {
        const expected = point[`${side}_y_px`];
        const actual = observation?.[`${side}_hand_y_px`] ?? null;
        const visible = observation?.[`${side}_hand_visible`] ?? false;
        if (expected === null) {
          if (actual !== null || visible) clearStateErrors++;
        } else if (actual === null || !visible) {
          clearStateErrors++;
        } else {
          coordinateErrors.push(Math.abs(actual - expected));
        }
      }
      return { ...result, gold: point, coordinate_errors_px: coordinateErrors, clear_state_errors: clearStateErrors };
    });
    const errors = rows.flatMap((row) => row.coordinate_errors_px as number[]);
    const clearStateErrors = rows.reduce((sum, row) => sum + Number(row.clear_state_errors), 0);
    const valid = rows.filter((row) => row.exit_code === 0 && row.observation).length;
    const precise = errors.filter((error) => error <= 12).length;
    const usable = errors.filter((error) => error <= 24).length;
    return {
      model,
      valid_observations: valid,
      expected_observations: gold.length,
      total_call_ms: rows.reduce((sum, row) => sum + Number(row.wall_ms), 0),
      mean_call_ms: Math.round(rows.reduce((sum, row) => sum + Number(row.wall_ms), 0) / rows.length),
      mean_absolute_error_px: errors.length ? Number((errors.reduce((a, b) => a + b, 0) / errors.length).toFixed(1)) : null,
      max_error_px: errors.length ? Math.max(...errors) : null,
      within_12px: `${precise}/${errors.length}`,
      within_24px: `${usable}/${errors.length}`,
      clear_state_errors: clearStateErrors,
      passes_precise_gate: valid === gold.length && errors.length === 7 && precise === errors.length && clearStateErrors === 0,
      passes_usable_gate: valid === gold.length && errors.length === 7 && usable === errors.length && clearStateErrors === 0,
      rows,
    };
  });

  const summary = {
    schema_version: 1,
    project_id: projectId,
    source,
    recipe_id: "hand-swipe-single-frame-fanout-v1",
    execution: { engine: "codex", models, reasoning_effort: "medium", concurrency: parallel },
    inputs: { frame_count: gold.length, width: 1280, height: 720, fps: 30 },
    timing: { extraction_ms: extractionMs, model_fanout_wall_ms: fanoutMs },
    grading: { precise_threshold_px: 12, usable_threshold_px: 24, expected_numeric_coordinates: 7 },
    models: graded,
  };
  fs.writeFileSync(path.join(evalDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
