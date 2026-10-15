import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { sfxCatalogSchema, type SfxCatalogEntry } from "@/lib/sfx-catalog/schema";

import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";
import { appendMotionAuditEvent, readMotionAudit } from "./motion-audit";
import { projectDir } from "./paths";
import { personalCatalogFile, personalLibraryCatalogPath, personalLibraryRoot, resolvePersonalLibraryFile } from "./personal-library";
import { readSharedSfxCatalog } from "./sfx-catalog";
import { projectSoundReceiptPath, validateSynthSoundReceipt } from "./synth-sounds";

/**
 * Intake of a synthesized project sound into the creator's personal SFX library (in the
 * profile, never the repository catalog, because the entry names its project): copy the
 * exact rendered bytes, measure them with the catalog's analysis script, and register an
 * owned catalog entry with provenance back to the project, program and values. Every
 * project's Library lists it under the creator's own media.
 */

type SfxAnalysis = NonNullable<SfxCatalogEntry["analysis"]>;
export type AnalyzeSound = (absolutePath: string) => Promise<SfxAnalysis | null>;

const ANALYZE_TIMEOUT_MS = 60_000;

/** Run `scripts/sfx-analyze.py` with the music venv; null when the environment is unavailable. */
export const analyzeWithCatalogScript: AnalyzeSound = (absolutePath) => new Promise((resolve) => {
  const python = path.resolve(process.cwd(), ".venv-music", "bin", "python");
  const script = path.resolve(process.cwd(), "scripts", "sfx-analyze.py");
  if (!fs.existsSync(python) || !fs.existsSync(script)) {
    resolve(null);
    return;
  }
  execFile(python, [script, absolutePath], { timeout: ANALYZE_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
    if (error) {
      resolve(null);
      return;
    }
    try {
      const parsed = JSON.parse(stdout) as Record<string, { analysis?: SfxAnalysis }>;
      resolve(Object.values(parsed)[0]?.analysis ?? null);
    } catch {
      resolve(null);
    }
  });
});

function catalogId(projectId: string, soundId: string, sha256: string): string {
  const slug = `${projectId}-${soundId}`.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
  return `synth-${slug || "sound"}-${sha256.slice(0, 8)}`;
}

function titleFor(soundId: string): string {
  const words = soundId.replace(/[._-]+/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : "Synthesized sound";
}

export type LibraryIntakeResult = {
  catalog_id: string;
  file: string;
  added: boolean;
  analysis: "measured" | "unavailable";
};

export async function addSynthSoundToLibrary(
  projectId: string,
  soundId: string,
  analyze: AnalyzeSound = analyzeWithCatalogScript,
  now: () => Date = () => new Date(),
): Promise<LibraryIntakeResult> {
  const receipt = readJsonFile<unknown>(projectSoundReceiptPath(projectId, soundId), null);
  validateSynthSoundReceipt(receipt);
  const source = path.join(projectDir(projectId), receipt.output.project_relative_path);
  const bytes = fs.readFileSync(source);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== receipt.output.sha256) throw new Error("The rendered sound no longer matches its receipt; render it again");

  const catalogPath = personalLibraryCatalogPath("sfx");
  // Read the raw catalog so collection entries filtered out of readSfxCatalog() are preserved.
  const raw = fs.existsSync(catalogPath)
    ? sfxCatalogSchema.parse(JSON.parse(fs.readFileSync(catalogPath, "utf8")))
    : { schema_version: 1 as const, sound_effects: [] };
  const existing = raw.sound_effects.find((entry) => entry.sha256 === sha256);
  if (existing) {
    return { catalog_id: existing.id, file: personalCatalogFile(existing.file), added: false, analysis: existing.analysis ? "measured" : "unavailable" };
  }
  const shared = readSharedSfxCatalog().sound_effects.find((entry) => entry.sha256 === sha256);
  if (shared) return { catalog_id: shared.id, file: shared.file, added: false, analysis: shared.analysis ? "measured" : "unavailable" };

  const id = catalogId(projectId, soundId, sha256);
  const file = `owned/synthesized/${id}.wav`;
  const destination = resolvePersonalLibraryFile("sfx", personalCatalogFile(file));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (!fs.existsSync(destination)) {
    const pending = `${destination}.${process.pid}.pending`;
    fs.writeFileSync(pending, bytes);
    fs.renameSync(pending, destination);
  }
  const analysis = await analyze(destination);
  let request: string | null = null;
  for (const event of readMotionAudit(projectId, "sound", soundId).events) {
    if (event.type === "revision" && event.request) request = event.request;
  }
  const entry: SfxCatalogEntry = {
    id,
    title: titleFor(soundId),
    description: (request ? `Synthesized for: ${request}` : `Synthesized sound "${soundId}" from a DreamCut project.`).slice(0, 800),
    category: "synthesized",
    tags: ["synthesized"],
    good_for: [],
    avoid_for: [],
    file,
    source_status: "owned",
    duration_seconds: receipt.output.duration_seconds,
    sample_rate_hz: receipt.output.sample_rate,
    channels: receipt.output.channels,
    sha256,
    source_provider: "DreamCut synthesized sound",
    source_url: `dreamcut://projects/${encodeURIComponent(projectId)}/sounds/${encodeURIComponent(soundId)}`,
    clearance_note: `Generated in project ${projectId} from sounds/${soundId}/synth.js (seed ${receipt.parameters.seed}, values ${receipt.parameters.values_sha256.slice(0, 12)}). Owned by the creator.`.slice(0, 800),
    acquired_at: now().toISOString().slice(0, 10),
    ...(analysis ? { analysis } : {}),
  };
  const next = sfxCatalogSchema.parse({ ...raw, sound_effects: [...raw.sound_effects, entry] });
  fs.mkdirSync(personalLibraryRoot("sfx"), { recursive: true });
  writeJsonFileAtomic(catalogPath, next, (value) => { sfxCatalogSchema.parse(value); });

  appendMotionAuditEvent(projectId, { kind: "sound", id: soundId }, { type: "person", via: "editor" }, {
    type: "library_add", catalog_id: id, file: personalCatalogFile(file), sha256, analyzed: analysis != null,
  });
  return { catalog_id: id, file: personalCatalogFile(file), added: true, analysis: analysis ? "measured" : "unavailable" };
}
