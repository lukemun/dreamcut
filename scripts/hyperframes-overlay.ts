import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  MANIFEST_FILE_NAME,
  applyCanvasSizeToHtml, applyDurationToHtml,
  authoredSegmentDurations,
  canvasSizeForValues,
  compositionCoverage,
  injectRuntimeIntoHtml,
  manifestSha256,
  parseCompositionManifest,
  rendersOpaque,
  resolveManifestValues,
  validateCompositionSources,
  valuesSha256,
  type CompositionManifest,
} from "@/lib/hyperframes/composition-manifest";
import {
  appendMotionAuditEvent,
  readMotionAudit,
  motionAuditContextFromArgs,
  recordRevisionIfChanged,
} from "@/lib/local-store/motion-audit";

import { writeJsonFileAtomic } from "@/lib/local-store/atomic-json";
import { resolveTiming } from "@/lib/hyperframes/composition-timing";
import {
  NO_VALUES_KEY,
  candidateReceiptPath,
  findCandidateRender,
  parseCompositionSourceSpec,
  writeCompositionSource,
} from "@/lib/local-store/hyperframes-candidates";
import {
  fingerprintHyperframesSource,
  hyperframesSourceFileHashes,
  readHyperframesTextSources,
  validateHyperframesOverlayReceipt,
  type HyperframesOverlayReceipt,
} from "@/lib/local-store/hyperframes-overlays";
import {
  isSafeHyperframesCompositionId,
  projectDir,
  projectExists,
  projectHyperframesCompositionDir,
  projectHyperframesDir,
  projectHyperframesReceiptPath,
} from "@/lib/local-store/paths";

type Command = "scaffold" | "check" | "preview" | "render" | "prepare";
type Resolution = "landscape" | "portrait" | "square";

function usage(): never {
  throw new Error([
    "Usage:",
    "  pnpm hyperframes-overlay scaffold <project-id> <composition-id> [--resolution portrait|landscape|square]",
    "  pnpm hyperframes-overlay check <project-id> <composition-id>",
    "  pnpm hyperframes-overlay preview <project-id> <composition-id>",
    "  pnpm hyperframes-overlay render <project-id> <composition-id> --approved [--values '<json>'] [--rating 1-5]",
    "  pnpm hyperframes-overlay prepare <project-id> <composition-id> [--spec @spec.json] [--values '<json>'] [--json]",
    "    Writes agent source files (optional), checks, and renders a candidate for a proposal to review.",
    "",
    "Audit options (all commands): --agent <name> --model <id> --effort <level>",
    "  --feedback-ids <id,id> --proposal-id <id> --request <text> --approved-by editor|chat",
    "Without --agent, the action is recorded as a person in the editor.",
  ].join("\n"));
}

function optionValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index < 0) return null;
  return args[index + 1] ?? null;
}

function parseArgs(argv: string[]) {
  const command = argv[0] as Command | undefined;
  const projectId = argv[1];
  const compositionId = argv[2];
  if (!command || !["scaffold", "check", "preview", "render", "prepare"].includes(command)
    || !projectId || !compositionId || !isSafeHyperframesCompositionId(compositionId)) {
    usage();
  }
  if (!projectExists(projectId)) throw new Error(`Timeline project does not exist: ${projectId}`);
  const requestedResolution = optionValue(argv, "--resolution") ?? "portrait";
  if (!["landscape", "portrait", "square"].includes(requestedResolution)) {
    throw new Error(`Unsupported resolution: ${requestedResolution}`);
  }
  const ratingText = optionValue(argv, "--rating");
  const rating = ratingText == null ? null : Number(ratingText);
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    throw new Error("--rating must be a whole number from 1 to 5");
  }
  const valuesText = optionValue(argv, "--values");
  let values: unknown;
  if (valuesText != null) {
    try {
      values = JSON.parse(valuesText.startsWith("@") ? fs.readFileSync(valuesText.slice(1), "utf8") : valuesText);
    } catch (error) {
      throw new Error(`--values must be JSON or @file.json: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const approvedBy = optionValue(argv, "--approved-by") ?? "editor";
  if (approvedBy !== "editor" && approvedBy !== "chat") throw new Error("--approved-by must be editor or chat");
  return {
    command,
    projectId,
    compositionId,
    resolution: requestedResolution as Resolution,
    approved: argv.includes("--approved"),
    json: argv.includes("--json"),
    specPath: optionValue(argv, "--spec"),
    expectFingerprint: optionValue(argv, "--expect-fingerprint"),
    approvedBy: approvedBy as "editor" | "chat",
    rating,
    values,
    ...motionAuditContextFromArgs(argv),
  };
}

type Args = ReturnType<typeof parseArgs>;

type LoadedManifest = { manifest: CompositionManifest; sha256: string } | null;

function loadManifest(source: string): LoadedManifest {
  const manifestPath = path.join(source, MANIFEST_FILE_NAME);
  if (!fs.existsSync(manifestPath)) return null;
  const text = fs.readFileSync(manifestPath, "utf8");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`Animation controls file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { manifest: parseCompositionManifest(raw), sha256: manifestSha256(text) };
}

function runHyperframes(cwd: string, args: string[], capture = false): string {
  const cli = createRequire(import.meta.url).resolve("hyperframes/bin/hyperframes.mjs");
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: "1", HYPERFRAMES_NO_TELEMETRY: "1" },
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw new Error(`Animation runtime could not start: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = capture ? `\n${[result.stdout, result.stderr].filter(Boolean).join("\n").trim()}` : "";
    throw new Error(`HyperFrames command failed: ${args.join(" ")}${detail}`);
  }
  return capture ? result.stdout.trim() : "";
}

function sha256(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

type FfprobeJson = {
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
    pix_fmt?: string;
    tags?: { alpha_mode?: string; ALPHA_MODE?: string };
  }>;
  format?: { duration?: string };
};

function parseFrameRate(value: string | undefined): number {
  if (!value) return 0;
  const parts = value.split("/").map(Number);
  const numerator = parts[0] ?? 0;
  const denominator = parts[1] ?? 1;
  return numerator !== 0 && denominator !== 0 ? numerator / denominator : 0;
}

function probeOutput(filePath: string, expectOpaque = false) {
  const result = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt:stream_tags=alpha_mode",
    "-of", "json",
    filePath,
  ], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`ffprobe failed: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout) as FfprobeJson;
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const duration = Number(parsed.format?.duration);
  const alphaMode = video?.tags?.alpha_mode ?? video?.tags?.ALPHA_MODE;
  if (!video || !Number.isFinite(duration) || duration <= 0 || !video.width || !video.height) {
    throw new Error("Rendered HyperFrames overlay is missing valid video metadata");
  }
  if (alphaMode !== "1" && !/^(?:yuva|gbrap|rgba|argb|bgra|abgr|ya)/i.test(video.pix_fmt ?? "")) {
    throw new Error("Rendered WebM has no alpha channel; make the HyperFrames composition background transparent");
  }
  const alphaProbe = spawnSync("ffmpeg", [
    "-v", "error",
    ...(video.codec_name === "vp9" ? ["-c:v", "libvpx-vp9"] : []),
    "-ss", String(Math.min(duration / 2, Math.max(0, duration - 0.01))),
    "-i", filePath,
    "-frames:v", "1",
    "-vf", "alphaextract,signalstats,metadata=print:file=-",
    "-f", "null", "-",
  ], { encoding: "utf8" });
  const minimumAlpha = Number(alphaProbe.stdout.match(/lavfi\.signalstats\.YMIN=(\d+)/)?.[1]);
  // A full-screen graphic (its controls file's opaque switch is on) legitimately has no transparent pixel.
  if (alphaProbe.status !== 0 || !Number.isFinite(minimumAlpha) || (minimumAlpha >= 255 && !expectOpaque)) {
    throw new Error("Rendered WebM declares alpha but decoded pixels are fully opaque; make the HyperFrames composition background transparent");
  }
  return {
    duration,
    width: video.width,
    height: video.height,
    fps: parseFrameRate(video.r_frame_rate),
    codec: video.codec_name ?? "unknown",
    pixelFormat: video.pix_fmt ?? null,
  };
}

function scaffold(projectId: string, compositionId: string, resolution: Resolution) {
  const parent = projectHyperframesDir(projectId);
  const destination = projectHyperframesCompositionDir(projectId, compositionId);
  if (fs.existsSync(destination)) throw new Error(`HyperFrames composition already exists: ${destination}`);
  fs.mkdirSync(parent, { recursive: true });
  runHyperframes(process.cwd(), [
    "init", destination,
    "--non-interactive",
    "--example", "blank",
    "--resolution", resolution,
  ]);
  console.log(`HyperFrames source: ${destination}`);
  console.log(`Next: pnpm hyperframes-overlay check ${projectId} ${compositionId}`);
}

/**
 * Validate the composition and append revision, coverage and validation audit events.
 * Coverage is recorded, never enforced; only broken controls files or runtime checks fail.
 */
function check(args: Args): { source: string; fingerprint: string; loaded: LoadedManifest } {
  const { projectId, compositionId } = args;
  const source = projectHyperframesCompositionDir(projectId, compositionId);
  if (!fs.existsSync(source)) throw new Error(`HyperFrames composition does not exist: ${source}`);
  const subject = { kind: "composition" as const, id: compositionId };
  const fingerprint = fingerprintHyperframesSource(source);
  const sources = readHyperframesTextSources(source);

  let loaded: LoadedManifest = null;
  let manifestError: string | null = null;
  try {
    loaded = loadManifest(source);
  } catch (error) {
    manifestError = error instanceof Error ? error.message : String(error);
  }
  const manifestPath = path.join(source, MANIFEST_FILE_NAME);
  const revision = recordRevisionIfChanged(projectId, subject, args.actor, {
    type: "revision",
    source_fingerprint_sha256: fingerprint,
    manifest_sha256: loaded?.sha256 ?? (fs.existsSync(manifestPath) ? manifestSha256(fs.readFileSync(manifestPath, "utf8")) : null),
    files: hyperframesSourceFileHashes(source),
    feedback_ids: args.feedbackIds,
    proposal_id: args.proposalId,
    request: args.request,
  });
  if (revision) {
    appendMotionAuditEvent(projectId, subject, args.actor, {
      type: "coverage",
      source_fingerprint_sha256: fingerprint,
      coverage: compositionCoverage(loaded?.manifest ?? null, sources),
    });
  }

  const validation = manifestError
    ? { errors: [manifestError], warnings: [] as string[] }
    : validateCompositionSources(loaded?.manifest ?? null, sources);
  // The runtime check launches a browser (about 6 s). A value change re-renders unchanged code,
  // so code that already passed keeps its result; the audit already records that validation.
  const alreadyPassed = validation.errors.length === 0 && readMotionAudit(projectId, "composition", compositionId).events
    .some((event) => event.type === "validation" && event.ok && event.source_fingerprint_sha256 === fingerprint);
  if (alreadyPassed) {
    for (const warning of validation.warnings) console.warn(`Warning: ${warning}`);
    return { source, fingerprint, loaded };
  }
  let runtimeError: string | null = null;
  if (validation.errors.length === 0) {
    try {
      const output = runHyperframes(source, ["check"], true);
      if (output) console.log(output);
    } catch (error) {
      runtimeError = error instanceof Error ? error.message : String(error);
    }
  }
  const errors = runtimeError ? [...validation.errors, runtimeError] : validation.errors;
  appendMotionAuditEvent(projectId, subject, args.actor, {
    type: "validation",
    source_fingerprint_sha256: fingerprint,
    ok: errors.length === 0,
    errors,
    warnings: validation.warnings,
  });
  for (const warning of validation.warnings) console.warn(`Warning: ${warning}`);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return { source, fingerprint, loaded };
}

/** Copy the source for a parameterized render so injected values never touch the original. */
function prepareParameterizedSource(source: string, injectHtml: (html: string) => string): string {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-hf-render-"));
  const copy = path.join(scratch, "source");
  fs.cpSync(source, copy, {
    recursive: true,
    filter: (entry) => {
      const name = path.basename(entry);
      return name !== "renders" && name !== ".git" && name !== "node_modules";
    },
  });
  const nodeModules = path.join(source, "node_modules");
  if (fs.existsSync(nodeModules)) fs.symlinkSync(nodeModules, path.join(copy, "node_modules"), "dir");
  const indexPath = path.join(copy, "index.html");
  if (!fs.existsSync(indexPath)) throw new Error("Animation with controls needs an index.html to receive values");
  fs.writeFileSync(indexPath, injectHtml(fs.readFileSync(indexPath, "utf8")));
  return copy;
}

function preview(projectId: string, compositionId: string) {
  const source = projectHyperframesCompositionDir(projectId, compositionId);
  if (!fs.existsSync(source)) throw new Error(`HyperFrames composition does not exist: ${source}`);
  runHyperframes(source, ["preview"]);
}

type RenderMode = "approved" | "candidate";

function render(args: Args, mode: RenderMode = "approved") {
  const { projectId, compositionId, approved } = args;
  if (mode === "approved" && !approved) {
    throw new Error("Render requires --approved after the final HyperFrames Studio preview is approved");
  }
  const startedAt = Date.now();
  const projectRoot = projectDir(projectId);
  const { source, fingerprint, loaded } = check(args);
  if (args.expectFingerprint && args.expectFingerprint !== fingerprint) {
    throw new Error("This motion graphic's code changed after it was proposed; ask for a revised proposal");
  }
  const values = loaded ? resolveManifestValues(loaded.manifest, args.values) : null;
  if (!loaded && args.values !== undefined) throw new Error("This animation has no controls file, so --values cannot apply");
  const segmentDurations = loaded ? authoredSegmentDurations(loaded.manifest) : null;
  const valuesKey = values ? valuesSha256(values) : NO_VALUES_KEY;
  const subject = { kind: "composition" as const, id: compositionId };

  if (mode === "candidate") {
    const cached = findCandidateRender(projectId, compositionId, fingerprint, valuesKey);
    if (cached) return { receipt: cached, reused: true, manifest: loaded?.manifest ?? null, values };
  }
  const renderSource = loaded && values && segmentDurations
    ? prepareParameterizedSource(source, (html) => {
      // A canvas control picks the render size; the renderer reads it from the root before scripts run.
      const size = canvasSizeForValues(loaded.manifest, values);
      const sized = size ? applyCanvasSizeToHtml(html, size) : html;
      // A declared length follows its timing controls; the renderer reads it before scripts run too.
      const length = loaded.manifest.timing ? resolveTiming(loaded.manifest.timing, values).duration : null;
      const timed = length ? applyDurationToHtml(sized, length) : sized;
      return injectRuntimeIntoHtml(timed, { controls: values, segment_durations: segmentDurations });
    })
    : source;

  const outputDirectory = path.join(projectRoot, "media", "hyperframes", compositionId);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const pendingOutputPath = path.join(
    outputDirectory,
    `.${compositionId}.${process.pid}.${Date.now()}.pending.webm`,
  );
  try {
    runHyperframes(renderSource, ["render", "--format", "webm", "--quality", "high", "--output", pendingOutputPath]);
  } finally {
    if (renderSource !== source) fs.rmSync(path.dirname(renderSource), { recursive: true, force: true });
  }

  let probe: ReturnType<typeof probeOutput>;
  try {
    probe = probeOutput(pendingOutputPath, rendersOpaque(loaded?.manifest ?? null, values));
  } catch (error) {
    // A rejected render is not kept; only checked outputs stay in project media.
    fs.rmSync(pendingOutputPath, { force: true });
    throw error;
  }
  const outputSha256 = sha256(pendingOutputPath);
  const outputPath = path.join(outputDirectory, `${compositionId}.${outputSha256.slice(0, 16)}.webm`);
  if (fs.existsSync(outputPath)) fs.unlinkSync(pendingOutputPath);
  else fs.renameSync(pendingOutputPath, outputPath);
  const version = runHyperframes(process.cwd(), ["--version"], true).match(/\d+\.\d+\.\d+/)?.[0] ?? "unknown";
  const receipt: HyperframesOverlayReceipt = {
    schema_version: 1,
    composition_id: compositionId,
    source: {
      project_relative_directory: path.relative(projectRoot, source).replaceAll(path.sep, "/"),
      fingerprint_sha256: fingerprint,
    },
    output: {
      project_relative_path: path.relative(projectRoot, outputPath).replaceAll(path.sep, "/"),
      sha256: outputSha256,
      duration_seconds: probe.duration,
      width: probe.width,
      height: probe.height,
      fps: probe.fps,
      codec: probe.codec,
      pixel_format: probe.pixelFormat,
      alpha_mode: "1",
    },
    render: {
      hyperframes_version: version,
      rendered_at: new Date().toISOString(),
      quality: "high",
      format: "webm",
      approved: mode === "approved",
    },
    ...(loaded && values && segmentDurations ? {
      parameters: {
        manifest_sha256: loaded.sha256,
        values_sha256: valuesSha256(values),
        values,
        segment_durations: segmentDurations,
        // Where this render's named moments fall and how long it runs, so linked sounds and the clip can follow.
        ...(loaded.manifest.timing ? { timing: resolveTiming(loaded.manifest.timing, values) } : {}),
      },
    } : {}),
  };
  writeJsonFileAtomic(projectHyperframesReceiptPath(projectId, compositionId), receipt, validateHyperframesOverlayReceipt);
  const candidatePath = candidateReceiptPath(projectId, compositionId, fingerprint, valuesKey);
  fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
  writeJsonFileAtomic(candidatePath, receipt, validateHyperframesOverlayReceipt);
  appendMotionAuditEvent(projectId, subject, args.actor, {
    type: "render",
    source_fingerprint_sha256: fingerprint,
    manifest_sha256: loaded?.sha256 ?? null,
    values_sha256: values ? valuesSha256(values) : null,
    values,
    output_path: receipt.output.project_relative_path,
    output_sha256: outputSha256,
    duration_seconds: probe.duration,
    renderer: `hyperframes@${version}`,
    elapsed_ms: Date.now() - startedAt,
    approval_required: mode === "approved",
    approved: mode === "approved",
  });
  if (mode === "candidate") return { receipt, reused: false, manifest: loaded?.manifest ?? null, values };
  appendMotionAuditEvent(projectId, subject, { type: "person", via: args.approvedBy }, {
    type: "review",
    source_fingerprint_sha256: fingerprint,
    decision: "approved",
    rating: args.rating,
    proposal_id: args.proposalId,
  });
  console.log(`Linked overlay: ${outputPath}`);
  console.log(`Receipt: ${projectHyperframesReceiptPath(projectId, compositionId)}`);
  console.log("Reload the editor Library; the overlay appears as a Cutout asset.");
  return { receipt, reused: false, manifest: loaded?.manifest ?? null, values };
}

/**
 * Agent path: optionally write source files from a spec, then check and render a
 * candidate. No human approval is recorded here; the proposal is the approval point.
 */
function prepare(args: Args) {
  if (args.specPath) {
    const specText = fs.readFileSync(args.specPath.startsWith("@") ? args.specPath.slice(1) : args.specPath, "utf8");
    writeCompositionSource(args.projectId, args.compositionId, parseCompositionSourceSpec(JSON.parse(specText)));
  }
  const result = render(args, "candidate");
  const output = {
    composition_id: args.compositionId,
    reused: result.reused,
    media_path: result.receipt.output.project_relative_path.replace(/^media\//, ""),
    source_url: `/api/projects/${args.projectId}/media/${result.receipt.output.project_relative_path.replace(/^media\//, "").split("/").map(encodeURIComponent).join("/")}`,
    duration_seconds: result.receipt.output.duration_seconds,
    width: result.receipt.output.width,
    height: result.receipt.output.height,
    fps: result.receipt.output.fps,
    has_alpha: true,
    source_fingerprint_sha256: result.receipt.source.fingerprint_sha256,
    values: result.values,
    controls: result.manifest?.controls ?? [],
    actors: result.manifest?.actors ?? [],
    markers: result.manifest?.markers ?? [],
  };
  if (args.json) console.log(`DREAMCUT_RESULT ${JSON.stringify(output)}`);
  else console.log(`Candidate: ${output.media_path}${result.reused ? " (reused)" : ""}`);
}

const args = parseArgs(process.argv.slice(2));
switch (args.command) {
  case "scaffold": scaffold(args.projectId, args.compositionId, args.resolution); break;
  case "check": check(args); console.log("Animation check passed."); break;
  case "preview": preview(args.projectId, args.compositionId); break;
  case "render": render(args); break;
  case "prepare": prepare(args); break;
}
