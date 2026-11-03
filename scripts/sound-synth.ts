import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { writeJsonFileAtomic } from "@/lib/local-store/atomic-json";
import {
  MANIFEST_FILE_NAME,
  manifestSha256,
  parseCompositionManifest,
  resolveManifestValues,
  valuesSha256,
  type CompositionManifest,
} from "@/lib/hyperframes/composition-manifest";
import { fingerprintHyperframesSource, hyperframesSourceFileHashes } from "@/lib/local-store/hyperframes-overlays";
import {
  appendMotionAuditEvent,
  isSafeMotionSubjectId,
  motionAuditContextFromArgs,
  recordRevisionIfChanged,
} from "@/lib/local-store/motion-audit";
import { projectDir, projectExists } from "@/lib/local-store/paths";
import {
  projectSoundReceiptPath,
  projectSoundSourceDir,
  validateSynthSoundReceipt,
  type SynthSoundReceipt,
} from "@/lib/local-store/synth-sounds";
import { SYNTH_FILE_NAME, SYNTH_RENDERER, encodeWav16, peakLevel, runSynthProgram } from "@/lib/sound-synth/synth";

function usage(): never {
  throw new Error([
    "Usage:",
    "  pnpm sound-synth scaffold <project-id> <sound-id>",
    "  pnpm sound-synth check <project-id> <sound-id>",
    "  pnpm sound-synth render <project-id> <sound-id> [--values '<json>'] [--seed <int>]",
    "  pnpm sound-synth prepare <project-id> <sound-id> [--spec @spec.json] [--values '<json>'] [--seed <int>] [--json]",
    "    spec: { synth_js: string, controls?: { schema_version: 1, controls: [...] } }",
    "",
    "Audit options: --agent <name> --model <id> --effort <level>",
    "  --feedback-ids <id,id> --proposal-id <id> --request <text>",
  ].join("\n"));
}

const SCAFFOLD = `// Synthesized sound. Define render({ sampleRate, controls, random }) and return
// { channels: [left, right] } with samples in [-1, 1]. Use random() instead of
// Math.random() only if you need to; both are seeded, so renders are reproducible.
function render({ sampleRate, controls }) {
  const length = Math.round(sampleRate * controls.length_seconds);
  const left = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 18);
    left[i] = Math.sin(2 * Math.PI * controls.pitch_hz * t) * envelope * 0.6;
  }
  return { channels: [left, left] };
}
`;

const SCAFFOLD_MANIFEST = {
  schema_version: 1,
  controls: [
    { id: "pitch_hz", kind: "number", label: "Pitch", default: 880, min: 80, max: 4000, step: 1, unit: "Hz" },
    { id: "length_seconds", kind: "number", label: "Length", default: 0.25, min: 0.05, max: 3, step: 0.01, unit: "s" },
  ],
};

function optionValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  const found = index >= 0 ? args[index + 1] : undefined;
  return found && !found.startsWith("--") ? found : null;
}

function parseArgs(argv: string[]) {
  const [command, projectId, soundId] = argv;
  if (!command || !["scaffold", "check", "render", "prepare"].includes(command) || !projectId || !soundId
    || !isSafeMotionSubjectId(soundId)) usage();
  if (!projectExists(projectId)) throw new Error(`Timeline project does not exist: ${projectId}`);
  const seedText = optionValue(argv, "--seed");
  const seed = seedText == null ? 1 : Number(seedText);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("--seed must be a whole number from 0 to 4294967295");
  const valuesText = optionValue(argv, "--values");
  let values: unknown;
  if (valuesText != null) {
    try {
      values = JSON.parse(valuesText.startsWith("@") ? fs.readFileSync(valuesText.slice(1), "utf8") : valuesText);
    } catch (error) {
      throw new Error(`--values must be JSON or @file.json: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return {
    command: command as "scaffold" | "check" | "render" | "prepare",
    projectId, soundId, seed, values,
    json: argv.includes("--json"),
    specPath: optionValue(argv, "--spec"),
    ...motionAuditContextFromArgs(argv),
  };
}

type Args = ReturnType<typeof parseArgs>;

function loadManifest(source: string): { manifest: CompositionManifest; sha256: string } | null {
  const manifestPath = path.join(source, MANIFEST_FILE_NAME);
  if (!fs.existsSync(manifestPath)) return null;
  const text = fs.readFileSync(manifestPath, "utf8");
  const manifest = parseCompositionManifest(JSON.parse(text));
  if (manifest.actors.length > 0 || manifest.markers.length > 0) {
    throw new Error("A sound's controls file may declare controls only, not actors or markers");
  }
  return { manifest, sha256: manifestSha256(text) };
}

function scaffold(args: Args) {
  const source = projectSoundSourceDir(args.projectId, args.soundId);
  if (fs.existsSync(source)) throw new Error(`Sound already exists: ${source}`);
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, SYNTH_FILE_NAME), SCAFFOLD);
  fs.writeFileSync(path.join(source, MANIFEST_FILE_NAME), `${JSON.stringify(SCAFFOLD_MANIFEST, null, 2)}\n`);
  console.log(`Sound source: ${source}`);
  console.log(`Next: pnpm sound-synth render ${args.projectId} ${args.soundId}`);
}

/** Validate and run the program once; append revision, coverage and validation audit events. */
function check(args: Args) {
  const source = projectSoundSourceDir(args.projectId, args.soundId);
  const programPath = path.join(source, SYNTH_FILE_NAME);
  if (!fs.existsSync(programPath)) throw new Error(`Sound program does not exist: ${programPath}`);
  const subject = { kind: "sound" as const, id: args.soundId };
  const fingerprint = fingerprintHyperframesSource(source);
  let loaded: ReturnType<typeof loadManifest> = null;
  const errors: string[] = [];
  try {
    loaded = loadManifest(source);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  const revision = recordRevisionIfChanged(args.projectId, subject, args.actor, {
    type: "revision",
    source_fingerprint_sha256: fingerprint,
    manifest_sha256: loaded?.sha256 ?? null,
    files: hyperframesSourceFileHashes(source),
    feedback_ids: args.feedbackIds,
    proposal_id: args.proposalId,
    request: args.request,
  });
  if (revision) {
    appendMotionAuditEvent(args.projectId, subject, args.actor, {
      type: "coverage",
      source_fingerprint_sha256: fingerprint,
      coverage: {
        has_manifest: loaded != null,
        declared_controls: loaded?.manifest.controls.length ?? 0,
        declared_actors: 0,
        declared_markers: 0,
        undeclared_actor_attributes: 0,
        missing_actor_attributes: 0,
      },
    });
  }
  let result: ReturnType<typeof runSynthProgram> | null = null;
  let values: Record<string, string | number | boolean> = {};
  if (errors.length === 0) {
    try {
      values = loaded ? resolveManifestValues(loaded.manifest, args.values) : {};
      if (!loaded && args.values !== undefined) throw new Error("This sound has no controls file, so --values cannot apply");
      result = runSynthProgram(fs.readFileSync(programPath, "utf8"), { controls: values, seed: args.seed });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  const warnings: string[] = [];
  if (result && peakLevel(result.channels) > 1) warnings.push("Samples exceed full scale and will be clipped");
  if (result && peakLevel(result.channels) < 0.01) warnings.push("The sound is nearly silent");
  appendMotionAuditEvent(args.projectId, subject, args.actor, {
    type: "validation",
    source_fingerprint_sha256: fingerprint,
    ok: errors.length === 0,
    errors,
    warnings,
  });
  for (const warning of warnings) console.warn(`Warning: ${warning}`);
  if (errors.length > 0 || !result) throw new Error(errors.join("\n"));
  return { source, fingerprint, loaded, values, result };
}

/** Rendering is local preparation, not timeline placement, so it needs no approval. */
function render(args: Args) {
  const startedAt = Date.now();
  const { fingerprint, loaded, values, result } = check(args);
  const wav = encodeWav16(result.channels, result.sampleRate);
  const outputSha256 = createHash("sha256").update(wav).digest("hex");
  const root = projectDir(args.projectId);
  const outputDirectory = path.join(root, "media", "sounds", args.soundId);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, `${args.soundId}.${outputSha256.slice(0, 16)}.wav`);
  if (!fs.existsSync(outputPath)) {
    const pending = `${outputPath}.${process.pid}.pending`;
    fs.writeFileSync(pending, wav);
    fs.renameSync(pending, outputPath);
  }
  const relativeOutput = path.relative(root, outputPath).replaceAll(path.sep, "/");
  const receipt: SynthSoundReceipt = {
    schema_version: 1,
    sound_id: args.soundId,
    source: { project_relative_directory: `sounds/${args.soundId}`, fingerprint_sha256: fingerprint },
    parameters: {
      manifest_sha256: loaded?.sha256 ?? null,
      values_sha256: valuesSha256(values),
      values,
      seed: args.seed,
    },
    output: {
      project_relative_path: relativeOutput,
      sha256: outputSha256,
      duration_seconds: result.durationSeconds,
      sample_rate: result.sampleRate,
      channels: result.channels.length,
      peak: Math.min(1, Math.round(peakLevel(result.channels) * 1e4) / 1e4),
    },
    render: { renderer: SYNTH_RENDERER, rendered_at: new Date().toISOString() },
  };
  const receiptPath = projectSoundReceiptPath(args.projectId, args.soundId);
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  writeJsonFileAtomic(receiptPath, receipt, validateSynthSoundReceipt);
  appendMotionAuditEvent(args.projectId, { kind: "sound", id: args.soundId }, args.actor, {
    type: "render",
    source_fingerprint_sha256: fingerprint,
    manifest_sha256: loaded?.sha256 ?? null,
    values_sha256: valuesSha256(values),
    values: { ...values, __seed: args.seed },
    output_path: relativeOutput,
    output_sha256: outputSha256,
    duration_seconds: result.durationSeconds,
    renderer: SYNTH_RENDERER,
    elapsed_ms: Date.now() - startedAt,
    approval_required: false,
    approved: false,
  });
  if (!args.json) {
    console.log(`Sound: ${outputPath}`);
    console.log(`Receipt: ${receiptPath}`);
  }
  return { receipt, controls: loaded?.manifest.controls ?? [] };
}

const MAX_SYNTH_SOURCE_BYTES = 200_000;

/** Agent path: write the program (and optional controls) from a spec, then render. */
function prepare(args: Args) {
  if (args.specPath) {
    const spec = JSON.parse(fs.readFileSync(args.specPath.startsWith("@") ? args.specPath.slice(1) : args.specPath, "utf8")) as Record<string, unknown>;
    if (typeof spec.synth_js !== "string" || spec.synth_js.length === 0 || Buffer.byteLength(spec.synth_js) > MAX_SYNTH_SOURCE_BYTES) {
      throw new Error("synth_js must be JavaScript source up to 200 KB");
    }
    const source = projectSoundSourceDir(args.projectId, args.soundId);
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, SYNTH_FILE_NAME), spec.synth_js);
    const manifestPath = path.join(source, MANIFEST_FILE_NAME);
    if (spec.controls === null) fs.rmSync(manifestPath, { force: true });
    else if (spec.controls !== undefined) {
      parseCompositionManifest(spec.controls);
      fs.writeFileSync(manifestPath, `${JSON.stringify(spec.controls, null, 2)}\n`);
    }
  }
  const { receipt, controls } = render(args);
  const relative = receipt.output.project_relative_path.replace(/^media\//, "");
  const output = {
    sound_id: args.soundId,
    media_path: relative,
    source_url: `/api/projects/${args.projectId}/media/${relative.split("/").map(encodeURIComponent).join("/")}`,
    duration_seconds: receipt.output.duration_seconds,
    sample_rate: receipt.output.sample_rate,
    channels: receipt.output.channels,
    peak: receipt.output.peak,
    values: receipt.parameters.values,
    seed: receipt.parameters.seed,
    controls,
  };
  if (args.json) console.log(`DREAMCUT_RESULT ${JSON.stringify(output)}`);
  else console.log(`Sound: ${relative}`);
}

const args = parseArgs(process.argv.slice(2));
switch (args.command) {
  case "scaffold": scaffold(args); break;
  case "check": check(args); console.log("Sound check passed."); break;
  case "render": render(args); break;
  case "prepare": prepare(args); break;
}
