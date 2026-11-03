import fs from "node:fs";
import path from "node:path";

import { motionSubjectFromSourceUrl } from "@/lib/hyperframes/motion-media";
import { MANIFEST_FILE_NAME, parseCompositionManifest } from "@/lib/hyperframes/composition-manifest";
import { soundLink } from "@/lib/timeline/sound-link";

import { writeJsonFileAtomic } from "./atomic-json";
import { listCandidateRenders } from "./hyperframes-candidates";
import { personalLibraryDir } from "./personal-library";
import { projectDir } from "./paths";
import { activeElements, readTimeline } from "./store";
import { projectSoundReceiptPath, projectSoundSourceDir, validateSynthSoundReceipt } from "./synth-sounds";

/**
 * The creator's own reusable motion graphics (a show opener, a sting) in their personal Library:
 * the composition source and the values it was placed with, plus the synthesized sounds linked to it
 * and the cue each follows. An agent saves one from a project and uses it in another, where it renders
 * again and is placed by an ordinary proposal. Not a Template: Templates are for other people to follow.
 * Stored under `<profile>/library/motion/<id>/entry.json`; never committed.
 */
export type MotionLibrarySound = {
  sound_id: string; title: string; synth_js: string; controls: unknown | null; values: Record<string, string | number | boolean>; seed: number;
  cue: string | null; offset_seconds: number; lane_key: string; volume: number;
};
export type MotionLibraryEntry = {
  schema_version: 1; id: string; name: string; description: string; saved_at: string;
  composition: { composition_id: string; files: Array<{ path: string; text: string }>; values: Record<string, string | number | boolean> };
  sounds: MotionLibrarySound[];
};

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TEXT_SOURCE = /\.(?:html|css|js|mjs|json|svg|txt)$/i;
/** Written by the composition scaffold in every project; not part of a graphic's own source. */
const SCAFFOLD = new Set(["hyperframes.json", "meta.json", "package.json", "AGENTS.md", "CLAUDE.md"]);
const SKIP_DIRS = new Set(["node_modules", "renders", "snapshots", ".git", ".hyperframes"]);

export const motionLibraryRoot = () => path.join(personalLibraryDir(), "motion");
const entryPath = (id: string) => { if (!ID_RE.test(id)) throw new Error(`Invalid library id: ${id}`); return path.join(motionLibraryRoot(), id, "entry.json"); };
export const motionLibraryId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "motion-graphic";

function compositionFiles(directory: string, base = directory): Array<{ path: string; text: string }> {
  const files: Array<{ path: string; text: string }> = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(directory, entry.name), rel = path.relative(base, full).split(path.sep).join("/");
    if (entry.isDirectory()) { files.push(...compositionFiles(full, base)); continue; }
    if (rel === entry.name && SCAFFOLD.has(entry.name)) continue;
    if (!TEXT_SOURCE.test(entry.name)) throw new Error(`"${rel}" is not a text source; graphics that copy project images or fonts into assets/ cannot be saved to the Library yet`);
    files.push({ path: rel, text: fs.readFileSync(full, "utf8") });
  }
  return files;
}

/**
 * Save a placed motion graphic (`elementId`, a composition clip on the timeline) with the values it was
 * rendered with and the sounds linked to it. Saving under an existing name replaces that entry.
 */
export function saveMotionLibraryEntry(projectId: string, input: { element_id: string; name: string; description?: string }): MotionLibraryEntry {
  const timeline = readTimeline(projectId), live = activeElements(timeline);
  const clip = live.find(element => element.id === input.element_id);
  const subject = clip?.source_url ? motionSubjectFromSourceUrl(clip.source_url) : null;
  if (!clip || subject?.kind !== "composition") throw new Error("element_id must be a motion graphic clip on this project's timeline");
  const directory = path.join(projectDir(projectId), "hyperframes", subject.id);
  const files = compositionFiles(directory);
  if (!files.some(file => file.path === "index.html")) throw new Error("The motion graphic's source is missing index.html");
  const relative = `media/${decodeURIComponent(clip.source_url!.replace(/^\/api\/projects\/[^/]+\/media\//, ""))}`;
  const receipt = listCandidateRenders(projectId, subject.id).find(candidate => candidate.output.project_relative_path === relative);
  const manifestFile = files.find(file => file.path === MANIFEST_FILE_NAME);
  if (manifestFile) parseCompositionManifest(JSON.parse(manifestFile.text));
  const sounds = live.filter(element => soundLink(element)?.element_id === clip.id).map((sound): MotionLibrarySound => {
    const soundSubject = sound.source_url ? motionSubjectFromSourceUrl(sound.source_url) : null;
    if (soundSubject?.kind !== "sound") throw new Error(`Linked sound "${sound.props?.title ?? sound.id}" is not a synthesized sound; only synthesized sounds can be saved with a graphic`);
    const soundDir = projectSoundSourceDir(projectId, soundSubject.id);
    const soundReceipt = JSON.parse(fs.readFileSync(projectSoundReceiptPath(projectId, soundSubject.id), "utf8"));
    validateSynthSoundReceipt(soundReceipt);
    const controlsPath = path.join(soundDir, MANIFEST_FILE_NAME), link = soundLink(sound)!;
    return { sound_id: soundSubject.id, title: String(sound.props?.title ?? soundSubject.id), synth_js: fs.readFileSync(path.join(soundDir, "synth.js"), "utf8"),
      controls: fs.existsSync(controlsPath) ? JSON.parse(fs.readFileSync(controlsPath, "utf8")) : null,
      values: soundReceipt.parameters.values, seed: soundReceipt.parameters.seed,
      cue: link.cue ?? null, offset_seconds: link.offset_seconds, lane_key: sound.lane_key, volume: sound.volume ?? 1 };
  });
  const name = input.name.trim();
  if (!name) throw new Error("name is required");
  const entry: MotionLibraryEntry = { schema_version: 1, id: motionLibraryId(name), name, description: (input.description ?? "").trim(), saved_at: new Date().toISOString(),
    composition: { composition_id: subject.id, files, values: receipt?.parameters?.values ?? {} }, sounds };
  fs.mkdirSync(path.dirname(entryPath(entry.id)), { recursive: true });
  writeJsonFileAtomic(entryPath(entry.id), entry);
  return entry;
}

export function readMotionLibraryEntry(id: string): MotionLibraryEntry {
  const file = entryPath(id);
  if (!fs.existsSync(file)) throw Object.assign(new Error(`No Library motion graphic "${id}"`), { status: 404 });
  return JSON.parse(fs.readFileSync(file, "utf8")) as MotionLibraryEntry;
}

/** Compact listing for agents: what each saved graphic is, its controls, cues and linked sounds. */
export function listMotionLibrary() {
  let ids: string[] = [];
  try { ids = fs.readdirSync(motionLibraryRoot()).filter(id => ID_RE.test(id) && fs.existsSync(entryPath(id))); } catch { return []; }
  return ids.map(readMotionLibraryEntry).map(entry => {
    const manifest = entry.composition.files.find(file => file.path === MANIFEST_FILE_NAME);
    const parsed = manifest ? parseCompositionManifest(JSON.parse(manifest.text)) : null;
    return { id: entry.id, name: entry.name, description: entry.description, saved_at: entry.saved_at,
      controls: parsed?.controls.map(control => ({ id: control.id, label: control.label, kind: control.kind })) ?? [],
      cues: parsed?.timing?.cues.map(cue => ({ id: cue.id, label: cue.label })) ?? [], values: entry.composition.values,
      sounds: entry.sounds.map(sound => ({ title: sound.title, cue: sound.cue })) };
  }).sort((a, b) => b.saved_at.localeCompare(a.saved_at));
}
