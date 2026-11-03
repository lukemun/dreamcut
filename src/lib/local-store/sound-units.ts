/**
 * Sound units: split a reference's sound effects into single, clean units.
 *
 * The instrument analysis (Demucs) supplies stems for the exact source bytes; then
 * `scripts/sound-units.py` decomposes each chosen stem in the time-frequency domain
 * (onset-constrained NMF, one template set per event, Wiener masks) so a unit keeps
 * only its own event, not whatever overlapped it. Units are imported as project media
 * for `create_audio`; selected units can also be rebuilt as tunable synth sounds
 * (`unit-resynth.ts` through the shared sound-synth renderer).
 *
 * Storage: job output is a rebuildable cache under `analysis/sound-units/<key>/`,
 * written to a scratch directory and promoted atomically; imported units and rebuilt
 * sounds are project authority. Never edits a timeline or approves anything.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

import { toolError } from "@/lib/agent/tool-error";
import { parseSoundUnitModel, soundUnitControls, soundUnitSynthSpec } from "@/lib/sound-synth/unit-resynth";

import { runBackgroundCommand } from "./background-worker";
import { instrumentDirectory, readInstrumentAnalysis, startInstrumentAnalysis } from "./instrument-analysis";
import { listMediaFiles } from "./media";
import { importedMediaUrl, ingestMediaPath } from "./media-ingest";
import { agentAuditArgs } from "./motion-audit";
import { runMotionScript } from "./motion-script-runner";
import { projectDir, projectMediaDir } from "./paths";
import { withProjectLock } from "./store";

export const SOUND_UNITS_VERSION = "sound-units@1";
const script = path.resolve(process.cwd(), "scripts/sound-units.py");
const resynth = path.resolve(process.cwd(), "src/lib/sound-synth/unit-resynth.ts");
const python = process.env.STEMS_PYTHON || path.resolve(process.cwd(), ".venv-stems/bin/python");
const STEMS = ["drums", "bass", "other", "vocals"] as const;
type Stem = (typeof STEMS)[number];
const MAX_WINDOW_SECONDS = 30;
/** Free space kept beyond a job's own bytes (the job itself writes a few MB at most). */
const HEADROOM_BYTES = 512 * 1024 * 1024;
const CLEARANCE = "Reference audio the creator supplied: cleared for use in this project only. Do not add these units to tracked catalogs.";

export type SoundUnitEvent = { time_seconds: number; stem?: Stem; label?: string };
export type SoundUnitsRequest = {
  source: string;
  start_seconds: number;
  end_seconds: number;
  stems: Stem[];
  events: SoundUnitEvent[];
  max_units: number;
  recreate: true | false | string[];
  import: boolean;
  request?: string;
  feedback_ids?: string[];
};

type Leakage = {
  time_cut_foreign_share: number; unit_residual_crosstalk: number; reduction_db: number;
  time_cut_secondary_attack_db: number | null; unit_secondary_attack_db: number | null; own_energy_retained: number;
};
type ExtractedUnit = {
  name: string; stem: Stem; label: string; character: string; file: string; time_cut_file: string;
  onset_seconds: number; source_start_seconds: number; source_end_seconds: number;
  requested_seconds: number | null; attack_detected: boolean; attack_strength: number;
  features: Record<string, unknown> & { frequency_profile: Array<{ low_hz: number; high_hz: number; level_db: number }> };
  leakage: Leakage; confidence: number; model: unknown; sample_rate: number; channels: number;
};
type Extraction = { version: string; start_seconds: number; end_seconds: number; stems: Stem[]; units: ExtractedUnit[] };
type Fit = { mean_spectrum_error_db: number; envelope_correlation: number; time_frequency_error_db: number; length_ratio: number };
type Receipt = {
  schema_version: 1;
  tool: string;
  key: string;
  created_at: string;
  source: { media_path: string; sha256: string };
  stems: { model: "htdemucs"; analysis_key: string };
  request: Omit<SoundUnitsRequest, "recreate" | "import" | "request" | "feedback_ids">;
  clearance: string;
  imports: Record<string, { asset_id: string; media_path: string; sha256: string; source_url: string }>;
  rebuilds: Record<string, { sound_id: string; source_url: string; duration_seconds: number; fit: Fit | null }>;
  feedback_ids: string[];
};

function invalid(message: string): never {
  throw toolError("INVALID_ARGUMENTS", message, { action: "fix_arguments", reason: message });
}

function finite(value: unknown, name: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) invalid(`${name} must be a number of at least ${minimum}`);
  return value;
}

export function parseSoundUnitsRequest(body: Record<string, unknown>): SoundUnitsRequest {
  const allowed = new Set(["source", "source_url", "start_seconds", "end_seconds", "stems", "events", "max_units", "recreate", "import", "request", "feedback_ids", "agent"]);
  for (const key of Object.keys(body)) if (!allowed.has(key)) invalid(`Unknown field ${key}`);
  const source = body.source_url ?? body.source;
  if (typeof source !== "string" || !source.trim()) invalid("source_url (project media URL) or source (media path such as sources/clip.mp4) is required");
  const start = finite(body.start_seconds, "start_seconds");
  const end = finite(body.end_seconds, "end_seconds");
  if (!(end > start)) invalid("end_seconds must be after start_seconds");
  if (end - start > MAX_WINDOW_SECONDS) invalid(`A window can span at most ${MAX_WINDOW_SECONDS} seconds; split longer sections into several calls`);
  const stems = body.stems === undefined ? ["drums", "bass", "other"] : body.stems;
  if (!Array.isArray(stems) || stems.length === 0 || stems.length > 4 || !stems.every((stem) => STEMS.includes(stem as Stem)) || new Set(stems).size !== stems.length) {
    invalid(`stems must list distinct stems from ${STEMS.join(", ")}`);
  }
  const events = body.events === undefined ? [] : body.events;
  if (!Array.isArray(events) || events.length > 32) invalid("events must be a list of at most 32 events");
  const parsedEvents = events.map((event, index): SoundUnitEvent => {
    if (!event || typeof event !== "object") invalid(`events[${index}] must be an object`);
    const value = event as Record<string, unknown>;
    for (const key of Object.keys(value)) if (!["time_seconds", "stem", "label"].includes(key)) invalid(`events[${index}] has unknown field ${key}; use time_seconds, stem or label`);
    const time = finite(value.time_seconds, `events[${index}].time_seconds`);
    if (time < start || time > end) invalid(`events[${index}].time_seconds must be inside the window`);
    if (value.stem !== undefined && !(stems as string[]).includes(value.stem as string)) invalid(`events[${index}].stem must be one of the requested stems`);
    if (value.label !== undefined && (typeof value.label !== "string" || !value.label.trim() || value.label.length > 60)) invalid(`events[${index}].label must be short text`);
    return { time_seconds: time, ...(value.stem ? { stem: value.stem as Stem } : {}), ...(value.label ? { label: (value.label as string).trim() } : {}) };
  });
  const maxUnits = body.max_units === undefined ? 12 : body.max_units;
  if (!Number.isInteger(maxUnits) || (maxUnits as number) < 1 || (maxUnits as number) > 32) invalid("max_units must be a whole number from 1 to 32");
  if (parsedEvents.length > (maxUnits as number)) invalid("max_units must be at least the number of events");
  const recreate = body.recreate === undefined ? false : body.recreate;
  if (!(typeof recreate === "boolean" || (Array.isArray(recreate) && recreate.length <= 32 && recreate.every((name) => typeof name === "string" && name.length <= 80)))) {
    invalid("recreate must be true, false or a list of unit names or labels");
  }
  if (body.import !== undefined && typeof body.import !== "boolean") invalid("import must be true or false");
  if (body.request !== undefined && typeof body.request !== "string") invalid("request must be text");
  if (body.feedback_ids !== undefined && !(Array.isArray(body.feedback_ids) && body.feedback_ids.every((id) => typeof id === "string"))) invalid("feedback_ids must be a list of ids");
  return {
    source: source.trim(), start_seconds: start, end_seconds: end, stems: stems as Stem[], events: parsedEvents,
    max_units: maxUnits as number, recreate: recreate as SoundUnitsRequest["recreate"], import: body.import !== false,
    ...(typeof body.request === "string" ? { request: body.request.slice(0, 2000) } : {}),
    ...(body.feedback_ids ? { feedback_ids: body.feedback_ids as string[] } : {}),
  };
}

/** A project audio or video file, by media URL or media-relative path. */
export function resolveSoundUnitSource(projectId: string, source: string): { absolute: string; mediaPath: string } {
  let wanted = source;
  try {
    const url = new URL(source, "http://localhost");
    wanted = decodeURIComponent(url.pathname);
  } catch { /* plain path */ }
  const prefix = `/api/projects/${projectId}/media/`;
  if (wanted.startsWith(prefix)) wanted = wanted.slice(prefix.length);
  wanted = wanted.replace(/^\/+/, "").replace(/^media\//, "");
  const match = listMediaFiles(projectId).find((file) => (file.kind === "audio" || file.kind === "video")
    && (file.relPath.split(path.sep).join("/") === wanted));
  if (!match) {
    throw toolError("SOURCE_NOT_FOUND", "No audio or video in this project matches that source.", {
      action: "timeline_get", reason: "Use a project media URL or a media path such as sources/clip.mp4 from the project's media list.",
    }, 404);
  }
  return { absolute: path.join(projectMediaDir(projectId), match.relPath), mediaPath: match.relPath.split(path.sep).join("/") };
}

function recipeKey() {
  const hash = createHash("sha256");
  for (const file of [script, resynth]) hash.update(fs.readFileSync(file));
  return hash.digest("hex").slice(0, 16);
}

export function soundUnitsDirectory(projectId: string, key: string) {
  if (!/^[a-f0-9]{32}$/.test(key)) throw new Error("Invalid sound unit cache key");
  return path.join(projectDir(projectId), "analysis", "sound-units", key);
}

function readJson<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, "utf8")) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

function writeJsonAtomic(file: string, value: unknown) {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

const running = new Map<string, Promise<void>>();

async function runExtraction(directory: string, stemsDirectory: string, request: SoundUnitsRequest) {
  const parent = path.dirname(directory);
  fs.mkdirSync(parent, { recursive: true });
  const free = fs.statfsSync(parent);
  if (free.bavail * free.bsize < HEADROOM_BYTES) {
    throw toolError("STORAGE_LOW", "Not enough free disk space to write sound units.", {
      action: "ask_creator", reason: "Free some space on the project's disk, then call again.",
    }, 507);
  }
  const scratch = path.join(parent, `.${path.basename(directory)}.${randomUUID()}.tmp`);
  try {
    const args = [
      "-I", script, "extract", "--stems-dir", stemsDirectory, "--stems", request.stems.join(","),
      "--start", String(request.start_seconds), "--end", String(request.end_seconds),
      "--out", scratch, "--max-units", String(request.max_units), "--models",
      ...(request.events.length ? ["--events", JSON.stringify(request.events)] : []),
    ];
    const { stdout } = await runBackgroundCommand(python, args, { timeout: 180_000, maxBuffer: 4 * 1024 * 1024 });
    const status = JSON.parse(stdout.trim().split("\n").pop() ?? "{}") as { ok?: boolean; message?: string };
    if (!status.ok) throw new Error(status.message ?? "Sound unit extraction failed");
    fs.renameSync(scratch, directory);
  } catch (error) {
    if ((error as { toolError?: unknown }).toolError) throw error;
    const stdout = (error as { stdout?: string }).stdout;
    let message = error instanceof Error ? error.message : String(error);
    try { message = (JSON.parse(stdout?.trim().split("\n").pop() ?? "") as { message?: string }).message ?? message; } catch { /* keep */ }
    throw Object.assign(new Error(`Sound unit extraction failed: ${message.split("\n")[0].slice(0, 300)}`), { status: 500 });
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

async function scoreRebuild(unitFile: string, synthFile: string): Promise<Fit | null> {
  try {
    const { stdout } = await runBackgroundCommand(python, ["-I", script, "score", "--unit", unitFile, "--synth", synthFile], { timeout: 60_000 });
    return JSON.parse(stdout) as Fit;
  } catch { return null; }
}

function safeSoundId(key: string, name: string) {
  return `unit-${key.slice(0, 8)}-${name}`.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 128);
}

type Agent = { name?: string; model?: string; effort?: string } | undefined;

/** Extract, import and optionally rebuild. Returns compact facts per unit. */
export async function extractSoundUnits(projectId: string, request: SoundUnitsRequest, agent?: Agent) {
  const source = resolveSoundUnitSource(projectId, request.source);
  let stems = readInstrumentAnalysis(projectId, source.absolute);
  if (stems.state !== "ready") {
    const previousFailure = stems.state === "failed" ? stems.message : undefined;
    if (stems.state !== "preparing") {
      if (!fs.existsSync(python)) {
        throw toolError("RUNTIME_UNAVAILABLE", "The local stem separation runtime is not installed.", {
          action: "ask_creator", reason: "Install it with scripts/requirements-stems.txt (see that file), or set STEMS_PYTHON.",
        }, 503);
      }
      stems = await withProjectLock(projectId, () => startInstrumentAnalysis(projectId, source.absolute));
    }
    return {
      state: "preparing" as const,
      message: previousFailure ? `The last separation failed (${previousFailure}); separating again.` : (stems.message ?? "Separating the source into drums, bass, vocals and other stems."),
      retry_after_seconds: 30,
      next: { action: "call_again", tool: "sound_units_extract", reason: "Stem separation runs once per source (about a minute for a short clip); call again with the same arguments." },
    };
  }
  const result = stems.result!;
  if (request.end_seconds > result.duration + 0.01) invalid(`end_seconds is past the end of the source (${result.duration.toFixed(2)} s)`);
  const stemsDirectory = instrumentDirectory(projectId, stems.key);
  const parameters = { start_seconds: request.start_seconds, end_seconds: request.end_seconds, stems: request.stems, events: request.events, max_units: request.max_units };
  const key = createHash("sha256").update(JSON.stringify({ source: result.source_sha256, stems: stems.key, recipe: recipeKey(), parameters })).digest("hex").slice(0, 32);
  const directory = soundUnitsDirectory(projectId, key);
  let reused = true;
  if (!fs.existsSync(path.join(directory, "units.json"))) {
    reused = false;
    const pending = running.get(key);
    if (pending) await pending;
    else {
      const job = runExtraction(directory, stemsDirectory, request);
      running.set(key, job);
      try { await job; } finally { running.delete(key); }
    }
  }
  const extraction = readJson<Extraction>(path.join(directory, "units.json"));
  if (!extraction || extraction.version !== SOUND_UNITS_VERSION) throw new Error("Sound unit output is unreadable; delete its cache folder and retry");
  const receiptFile = path.join(directory, "receipt.json");
  const receipt: Receipt = readJson<Receipt>(receiptFile) ?? {
    schema_version: 1, tool: SOUND_UNITS_VERSION, key, created_at: new Date().toISOString(),
    source: { media_path: source.mediaPath, sha256: result.source_sha256 },
    stems: { model: "htdemucs", analysis_key: stems.key },
    request: { source: source.mediaPath, ...parameters }, clearance: CLEARANCE, imports: {}, rebuilds: {}, feedback_ids: [],
  };
  receipt.feedback_ids = [...new Set([...receipt.feedback_ids, ...(request.feedback_ids ?? [])])];

  if (request.import) {
    await withProjectLock(projectId, () => {
      for (const unit of extraction.units) {
        const existing = receipt.imports[unit.name];
        if (existing && fs.existsSync(path.join(projectMediaDir(projectId), existing.media_path))) continue;
        const asset = ingestMediaPath({ projectId, sourcePath: path.join(directory, unit.file), destinationDir: `sound-units/${key.slice(0, 12)}` });
        receipt.imports[unit.name] = { asset_id: asset.asset_id, media_path: asset.media_path, sha256: asset.source_sha256, source_url: importedMediaUrl(projectId, asset) };
      }
    });
  }

  const wanted = request.recreate === true ? extraction.units
    : Array.isArray(request.recreate) ? extraction.units.filter((unit) => (request.recreate as string[]).some((name) => name === unit.name || name === unit.label))
      : [];
  if (Array.isArray(request.recreate)) {
    const missing = request.recreate.filter((name) => !extraction.units.some((unit) => unit.name === name || unit.label === name));
    if (missing.length) invalid(`recreate names no unit: ${missing.join(", ")}. Use names or labels from this tool's units list`);
  }
  for (const unit of wanted) {
    const spec = soundUnitSynthSpec(parseSoundUnitModel(unit.model));
    const soundId = safeSoundId(key, unit.name);
    const specDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-unit-synth-"));
    try {
      const specFile = path.join(specDirectory, "spec.json");
      fs.writeFileSync(specFile, JSON.stringify(spec));
      const args = ["prepare", projectId, soundId, "--json", "--spec", `@${specFile}`, ...agentAuditArgs(agent),
        "--request", (request.request ?? `Rebuild sound unit ${unit.label} from ${source.mediaPath}`).slice(0, 2000),
        ...(request.feedback_ids?.length ? ["--feedback-ids", request.feedback_ids.join(",")] : [])];
      const { result: made } = await runMotionScript<{ source_url: string; media_path: string; duration_seconds: number }>("sound-synth", args);
      const fit = await scoreRebuild(path.join(directory, unit.file), path.join(projectMediaDir(projectId), made.media_path));
      receipt.rebuilds[unit.name] = { sound_id: soundId, source_url: made.source_url, duration_seconds: made.duration_seconds, fit };
    } finally {
      fs.rmSync(specDirectory, { recursive: true, force: true });
    }
  }
  writeJsonAtomic(receiptFile, receipt);

  const reductions = extraction.units.map((unit) => unit.leakage.reduction_db).sort((a, b) => a - b);
  return {
    state: "ready" as const,
    key,
    disposition: reused ? "reused" : "new",
    source: source.mediaPath,
    window: { start_seconds: extraction.start_seconds, end_seconds: extraction.end_seconds, stems: extraction.stems },
    clearance: CLEARANCE,
    summary: {
      units: extraction.units.length,
      median_leakage_reduction_db: reductions.length ? reductions[Math.floor(reductions.length / 2)] : null,
      low_confidence: extraction.units.filter((unit) => unit.confidence < 0.5).map((unit) => unit.name),
    },
    units: extraction.units.map((unit) => {
      const imported = receipt.imports[unit.name];
      const rebuilt = receipt.rebuilds[unit.name];
      const f = unit.features as Record<string, unknown>;
      return {
        name: unit.name, label: unit.label, character: unit.character, stem: unit.stem,
        onset_seconds: unit.onset_seconds, source_start_seconds: unit.source_start_seconds, source_end_seconds: unit.source_end_seconds,
        ...(unit.requested_seconds != null ? { requested_seconds: unit.requested_seconds, attack_detected: unit.attack_detected } : {}),
        duration_seconds: f.duration_seconds, attack_seconds: f.attack_seconds, decay_seconds: f.decay_seconds,
        spectral_centroid_hz: f.spectral_centroid_hz, spectral_flatness: f.spectral_flatness, low_energy_share: f.low_energy_share,
        centroid_sweep_octaves_per_second: f.centroid_sweep_octaves_per_second,
        frequency_profile_db: unit.features.frequency_profile.map((band) => band.level_db),
        leakage: unit.leakage, confidence: unit.confidence,
        ...(imported ? { source_url: imported.source_url, media_path: imported.media_path } : {}),
        ...(rebuilt ? { rebuilt: { sound_id: rebuilt.sound_id, source_url: rebuilt.source_url, duration_seconds: rebuilt.duration_seconds, fit: rebuilt.fit, controls: soundUnitControls(parseSoundUnitModel(unit.model)).map((control) => ({ id: control.id, label: control.label, default: control.default, min: control.min, max: control.max, unit: control.unit })) } } : {}),
      };
    }),
    frequency_profile_bands_hz: extraction.units[0]?.features.frequency_profile.map((band) => [band.low_hz, band.high_hz]) ?? [],
    next: {
      action: "proposal_create",
      reason: "Place a unit with create_audio using its source_url (or rebuilt.source_url) and a full source window; retune a rebuilt sound with sound_synth_prepare values and its sound_id. Nothing was placed on the timeline.",
    },
  };
}
