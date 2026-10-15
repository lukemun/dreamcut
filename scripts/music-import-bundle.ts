/**
 * Reconcile a reviewed, locally materialized music bundle into the canonical catalog.
 *
 * The bundle contains one full recording per annotation plus optional pre-rendered
 * excerpts. Only the full recording is adopted; excerpts become reversible cue windows.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import { musicCatalogSchema, type MusicCatalogTrack } from "../src/lib/music-catalog/schema";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const has = (name: string) => args.includes(`--${name}`);
const bundleArg = args[0];
const importId = flag("import-id");
const sourceFolderUrl = flag("source-folder-url");
const acquiredAt = flag("acquired-at");
const sourceStatus = flag("source-status");

if (!bundleArg || !importId || !sourceFolderUrl || !acquiredAt || !sourceStatus) {
  throw new Error("Usage: pnpm music-import-bundle <bundle-dir> --import-id <id> --source-folder-url <url> --acquired-at YYYY-MM-DD --source-status licensed|owned|reference_only [--dry-run]");
}
if (!["licensed", "owned", "reference_only"].includes(sourceStatus)) {
  throw new Error("--source-status must be licensed, owned, or reference_only");
}

const segmentSchema = z.object({
  file: z.string().min(1),
  label: z.enum(["bed", "build", "drop", "outro", "stinger"]),
  start_s: z.number().finite().min(0),
  end_s: z.number().finite().gt(0),
  duration_s: z.number().finite().gt(0),
  energy: z.string().min(1),
  use: z.string().min(1),
}).superRefine((value, context) => {
  if (value.end_s <= value.start_s) context.addIssue({ code: "custom", path: ["end_s"], message: "must exceed start_s" });
  if (Math.abs((value.end_s - value.start_s) - value.duration_s) > 0.05) {
    context.addIssue({ code: "custom", path: ["duration_s"], message: "does not match the source window" });
  }
});

const annotationSchema = z.object({
  file: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().min(1),
  source_url: z.string().url(),
  license: z.string().min(1),
  attribution: z.string().min(1),
  mood: z.array(z.string().min(1)).min(1),
  bpm: z.number().finite().gt(0).max(400),
  bpm_reliable: z.boolean(),
  bpm_alt: z.number().finite().gt(0).max(400).optional(),
  duration_s: z.number().finite().gt(0),
  energy_curve: z.string().min(1),
  best_for: z.array(z.string().min(1)).default([]),
  segments: z.array(segmentSchema),
  analysis_notes: z.array(z.string().min(1)).default([]),
});

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 128);
const bundleDir = path.resolve(bundleArg);
const annotationDir = path.join(bundleDir, "annotations");
const trackDir = path.join(bundleDir, "tracks");
const catalogDir = process.env.TIMELINE_MUSIC_CATALOG_DIR ?? path.resolve("music-catalog");
const catalogPath = path.join(catalogDir, "catalog.json");
const statusFolder = sourceStatus === "reference_only" ? "reference" : sourceStatus;
const audioDir = path.join(catalogDir, "audio", statusFolder);
const receiptRelative = path.posix.join("imports", importId);
const receiptDir = path.join(catalogDir, receiptRelative);

const annotations = fs.readdirSync(annotationDir)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => ({ name, value: annotationSchema.parse(JSON.parse(fs.readFileSync(path.join(annotationDir, name), "utf8"))) }));
if (annotations.length === 0) throw new Error("Bundle has no annotation JSON files");

const catalog = musicCatalogSchema.parse(JSON.parse(fs.readFileSync(catalogPath, "utf8")));
const existingById = new Map(catalog.tracks.map((track) => [track.id, track]));
const existingHashes = new Map<string, string>();
for (const track of catalog.tracks) for (const version of track.versions) {
  if (version.provenance?.sha256) existingHashes.set(version.provenance.sha256, track.id);
}

const roleByLabel = { bed: "bed", build: "build", drop: "reveal", outro: "outro", stinger: "custom" } as const;
const added: MusicCatalogTrack[] = [];
const reconciled: MusicCatalogTrack[] = [];
const copied: Array<{ source: string; destination: string }> = [];

for (const { name, value } of annotations) {
  const source = path.join(trackDir, path.basename(value.file));
  if (!fs.existsSync(source)) throw new Error(`${name}: missing full track ${path.basename(value.file)}`);
  const bytes = fs.readFileSync(source);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", source], { encoding: "utf8" }).trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`${name}: ffprobe returned no usable duration`);
  if (Math.abs(duration - value.duration_s) > 0.12) throw new Error(`${name}: annotated duration ${value.duration_s}s differs from media ${duration}s`);
  for (const segment of value.segments) if (segment.end_s > duration + 0.05) {
    throw new Error(`${name}: cue ${segment.label} exceeds the full recording`);
  }

  const id = slug(`${value.artist}-${value.title}`);
  const otherId = existingHashes.get(hash);
  if (otherId && otherId !== id) throw new Error(`${name}: media hash already belongs to ${otherId}`);
  const destinationName = path.basename(value.file);
  const destination = path.join(audioDir, destinationName);
  const file = path.posix.join(statusFolder, destinationName);
  const attributionRequired = /\bCC\s*BY\b/i.test(value.license);
  const licenseUrl = attributionRequired ? "https://creativecommons.org/licenses/by/4.0/" : undefined;
  const cues = value.segments.map((segment, index) => ({
    id: `${segment.label}_${index + 1}`,
    label: segment.label === "drop" ? "Drop / reveal" : segment.label[0].toUpperCase() + segment.label.slice(1),
    start_seconds: segment.start_s,
    end_seconds: segment.end_s,
    role: roleByLabel[segment.label],
    use_when: [segment.use],
    avoid_when: [],
    notes: `Imported reviewed cue; source label=${segment.label}; energy=${segment.energy}. The rendered excerpt ${segment.file} was not duplicated.`,
  }));
  const track: MusicCatalogTrack = {
    id,
    title: value.title,
    artist: value.artist,
    moods: value.mood,
    tempo_bpm: value.bpm_reliable ? value.bpm : undefined,
    textures: [],
    vocals: "instrumental",
    good_for: [...new Set([...value.best_for, ...value.segments.map((segment) => segment.use)])],
    avoid_for: [],
    analysis: {
      annotation_version: "assembled-music-bundle-v1",
      detected_tempo_bpm: value.bpm,
      tempo_reliable: value.bpm_reliable,
      alternative_tempo_bpm: value.bpm_alt,
      energy_curve: value.energy_curve,
      notes: value.analysis_notes,
    },
    default_version_id: "local",
    versions: [{
      id: "local",
      label: "Imported full recording",
      file,
      source_status: sourceStatus as "licensed" | "owned" | "reference_only",
      delivery_mode: "embedded",
      platforms: [],
      duration_seconds: Number(duration.toFixed(6)),
      provenance: {
        source_provider: value.artist.startsWith("Kevin MacLeod") ? "Incompetech" : "StreamBeats",
        source_url: value.source_url,
        source_file: value.file,
        license_name: value.license,
        license_url: licenseUrl,
        attribution_required: attributionRequired,
        attribution_text: value.attribution,
        acquired_at: acquiredAt,
        sha256: hash,
        import_receipt: path.posix.join(receiptRelative, "manifest.json"),
      },
      cues,
    }],
  };

  const previous = existingById.get(id);
  if (previous) {
    const previousHash = previous.versions.find((version) => version.id === "local")?.provenance?.sha256;
    if (previousHash !== hash) throw new Error(`${name}: catalog id ${id} already exists with different provenance`);
  } else {
    existingById.set(id, track);
    added.push(track);
  }
  reconciled.push(previous ?? track);
  copied.push({ source, destination });
}

const next = musicCatalogSchema.parse({ schema_version: 1, tracks: [...existingById.values()] });
const intendedDestinations = new Set(copied.map(({ destination }) => path.resolve(destination)));
const catalogFileReferences = next.tracks.flatMap((track) => track.versions.flatMap((version) => version.file
  ? [{ track_id: track.id, file: version.file, absolute: path.resolve(catalogDir, "audio", version.file) }]
  : []));
const missingFileReferences = catalogFileReferences
  .filter(({ absolute }) => !fs.existsSync(absolute) && !intendedDestinations.has(absolute))
  .map(({ track_id, file }) => ({ track_id, file }));
if (missingFileReferences.length > 0) {
  throw new Error(`Refusing catalog import: ${missingFileReferences.length} existing local file reference(s) are missing. Run pnpm music-catalog-storage with a recovery source first.`);
}
const manifest = {
  schema_version: 1,
  import_id: importId,
  source_folder_url: sourceFolderUrl,
  acquired_at: acquiredAt,
  source_status: sourceStatus,
  full_tracks: annotations.length,
  catalog_tracks_added: added.length,
  catalog_tracks_reconciled: reconciled.length,
  cue_windows: reconciled.reduce((sum, track) => sum + track.versions[0].cues.length, 0),
  rendered_excerpts_copied: 0,
  policy: "Full recordings are media authority; rendered excerpts are represented as reversible source cue windows.",
  catalog_audit: {
    total_tracks: next.tracks.length,
    file_references: catalogFileReferences.length,
    present_or_imported_file_references: catalogFileReferences.length - missingFileReferences.length,
    preexisting_missing_file_references: missingFileReferences,
  },
  tracks: reconciled.map((track) => ({ id: track.id, file: track.versions[0].file, sha256: track.versions[0].provenance?.sha256 })),
};

if (has("dry-run")) {
  console.log(JSON.stringify(manifest, null, 2));
  process.exit(0);
}

fs.mkdirSync(audioDir, { recursive: true });
fs.mkdirSync(path.join(receiptDir, "annotations"), { recursive: true });
for (const { source, destination } of copied) {
  if (fs.existsSync(destination)) {
    const existing = createHash("sha256").update(fs.readFileSync(destination)).digest("hex");
    const incoming = createHash("sha256").update(fs.readFileSync(source)).digest("hex");
    if (existing !== incoming) throw new Error(`Refusing to overwrite different media at ${destination}`);
  } else fs.copyFileSync(source, destination);
}
for (const { name } of annotations) fs.copyFileSync(path.join(annotationDir, name), path.join(receiptDir, "annotations", name));
for (const name of ["index.json", "INDEX.md", "CATALOG.md"]) {
  const source = path.join(bundleDir, name);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(receiptDir, name));
}
fs.writeFileSync(path.join(receiptDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(catalogPath, `${JSON.stringify(next, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
