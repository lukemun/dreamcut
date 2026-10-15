import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawnBackgroundWorker as spawn } from "./background-worker";
import { projectDir } from "./paths";
import { instrumentResultSchema, instrumentSettingsSchema, instrumentPresetSchema, instrumentSnapshotSchema, visibleInstrumentHits, type InstrumentId, type InstrumentPayload, type InstrumentSettings } from "../timeline/instrument-analysis";

const script = path.resolve(process.cwd(), "scripts/separate-instruments.py");
const python = process.env.STEMS_PYTHON || path.resolve(process.cwd(), ".venv-stems/bin/python");
export function instrumentDirectory(projectId: string, key: string) {
  if (!/^[a-f0-9]{64}-[a-f0-9]{16}$/.test(key)) throw new Error("Invalid instrument cache key");
  return path.join(projectDir(projectId), "analysis", "instruments", key);
}
function identity(source: string) {
  const hash = createHash("sha256").update(fs.readFileSync(source)).digest("hex");
  const recipe = createHash("sha256").update(fs.readFileSync(script)).digest("hex").slice(0, 16);
  return { hash, key: `${hash}-${recipe}` };
}
function readAnalysis(projectId: string, source: string): InstrumentPayload {
  const { key, hash } = identity(source);
  const directory = instrumentDirectory(projectId, key);
  let settings: InstrumentSettings = { selected: ["other"], minimum_strength: 0.08, marked_hits: [], excluded_hits: [], manual_hits: [] };
  // Source-time user corrections survive analysis recipe changes. Read the most
  // recently saved settings for these exact source bytes when this recipe is new.
  let settingsFile = path.join(directory, "settings.json");
  if (!fs.existsSync(settingsFile)) {
    const root = path.dirname(directory);
    const previous = fs.existsSync(root) ? fs.readdirSync(root).filter(name => name.startsWith(`${hash}-`) && /^[a-f0-9]{64}-[a-f0-9]{16}$/.test(name)).map(name => path.join(root, name, "settings.json")).filter(file => fs.existsSync(file)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs) : [];
    settingsFile = previous[0] ?? settingsFile;
  }
  try { settings = instrumentSettingsSchema.parse(JSON.parse(fs.readFileSync(settingsFile, "utf8"))); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  // Older analyses did not distinguish detected candidates from deliberate edit marks.
  // They remain visible in the viewer, but are never silently promoted to snap targets.
  settings = { ...settings, marked_hits: settings.marked_hits ?? [] };
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
    if (manifest.state === "ready") {
      const result = instrumentResultSchema.parse(manifest);
      if (result.source_sha256 !== hash) throw new Error("Instrument analysis source mismatch");
      return { key, state: "ready", result, settings };
    }
    if (manifest.state === "preparing") {
      try { process.kill(manifest.pid, 0); } catch { return { key, state: "failed", message: "Separation was interrupted. Retry to prepare the instrument lanes.", settings }; }
    }
    return { key, state: manifest.state === "preparing" ? "preparing" : "failed", message: manifest.message, settings };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { key, state: "missing", settings };
    throw error;
  }
}
export function readInstrumentAnalysis(projectId: string, source: string): InstrumentPayload {
  const current = readAnalysis(projectId, source);
  const file = path.join(path.dirname(instrumentDirectory(projectId, current.key)), `${current.key.slice(0, 64)}-presets.json`);
  try { return { ...current, presets: instrumentPresetSchema.array().max(100).parse(JSON.parse(fs.readFileSync(file, "utf8"))) }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return { ...current, presets: [] };
}

/** Caller holds the project lock. Presets survive changes to the analysis recipe. */
export function saveInstrumentPreset(projectId: string, source: string, name: unknown, input: unknown, renameId?: unknown, view?: unknown, viewer?: unknown) {
  const current = readInstrumentAnalysis(projectId, source);
  if (current.state !== "ready") throw new Error("Separate instruments before saving a preset");
  const existing = renameId == null ? null : current.presets?.find(preset => preset.id === renameId);
  if (renameId != null && !existing) throw new Error("Saved preset not found");
  const settings = instrumentSettingsSchema.parse(existing?.settings ?? input);
  if (!existing) {
    const range = instrumentSnapshotSchema.parse({ ...(view == null ? { start: 0, end: current.result!.duration } : view as object), hits: [] });
    if (range.end > current.result!.duration) throw new Error("Snapshot range must be inside the track");
    const hits = current.result!.lanes.filter(lane => lane.id !== "mix").flatMap(lane => visibleInstrumentHits(lane, { ...settings, excluded_hits: [] }, { candidates: true }).filter(hit => hit.time_seconds >= range.start && hit.time_seconds < range.end).map(hit => ({ instrument: lane.id as InstrumentId, time_seconds: hit.time_seconds, strength: hit.strength })));
    settings.snapshot = instrumentSnapshotSchema.parse({ ...range, hits });
    settings.snapshot_filter_overrides = [];
  }
  const preset = instrumentPresetSchema.parse({ id: existing?.id ?? randomUUID(), name, saved_at: existing?.saved_at ?? new Date().toISOString(), settings, viewer: existing ? existing.viewer : viewer });
  if (current.presets?.some(value => value.id !== preset.id && value.name.toLocaleLowerCase() === preset.name.toLocaleLowerCase())) throw new Error("A preset already has that name. Choose a different name.");
  if (preset.settings.manual_hits.some(hit => hit.time_seconds >= current.result!.duration)) throw new Error("Hit must be inside the track");
  const presets = existing ? current.presets!.map(value => value.id === existing.id ? preset : value) : [...(current.presets ?? []), preset];
  if (presets.length > 100) throw new Error("This track already has 100 presets");
  const file = path.join(path.dirname(instrumentDirectory(projectId, current.key)), `${current.key.slice(0, 64)}-presets.json`);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(presets));
  fs.renameSync(`${file}.tmp`, file);
  return { ...current, presets };
}
export function startInstrumentAnalysis(projectId: string, source: string) {
  const current = readInstrumentAnalysis(projectId, source);
  if (current.state === "ready" || current.state === "preparing") return current;
  if (!fs.existsSync(python)) throw new Error("Install the instrument runtime with scripts/requirements-stems.txt, or configure STEMS_PYTHON.");
  const directory = instrumentDirectory(projectId, current.key);
  fs.mkdirSync(directory, { recursive: true });
  const log = fs.openSync(path.join(directory, "worker.log"), "a");
  try {
  const child = spawn(python, [script, source, "--out", directory, "--source-sha256", current.key.slice(0, 64)], { detached: true, stdio: ["ignore", log, log] });
  child.on("error", error => fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({ state: "failed", message: error.message })));
  fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({ state: "preparing", pid: child.pid, message: "Starting instrument separation…" }));
  child.unref();
  return { ...current, state: "preparing" as const, message: "Starting instrument separation…" };
  } finally { fs.closeSync(log); }
}
export function saveInstrumentSettings(projectId: string, source: string, input: unknown) {
  const settings = instrumentSettingsSchema.parse(input);
  const current = readInstrumentAnalysis(projectId, source);
  if (current.state !== "ready") throw new Error("Separate instruments before choosing snap targets");
  if (settings.manual_hits.some(hit => hit.time_seconds >= current.result!.duration)) throw new Error("Hit must be inside the track");
  if (settings.snapshot && settings.snapshot.end > current.result!.duration) throw new Error("Snapshot range must be inside the track");
  const target = path.join(instrumentDirectory(projectId, current.key), "settings.json");
  fs.writeFileSync(`${target}.tmp`, JSON.stringify(settings));
  fs.renameSync(`${target}.tmp`, target);
  return { ...current, settings };
}
