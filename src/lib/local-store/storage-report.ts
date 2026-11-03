import fs from "node:fs";
import path from "node:path";

/**
 * Read-only storage inventory (step 1 of docs/architecture/storage-management.md). Classifies every
 * file under each project's media/ by the records that name it, never by its folder or file name,
 * and only sizes the record/evidence folders. It writes and deletes nothing.
 */

export type MediaBucket = "referenced" | "rebuildable" | "orphaned";
export type MediaReason =
  | "original" // imported source named by source-manifest.json
  | "edit" // named by a timeline, history, proposal, storyboard or other edit record (any project)
  | "render-authority" // full-quality render file of a current preparation package
  | "package-source-missing" // current package file whose source is gone, so it cannot be rebuilt
  | "evidence-only" // named only by analysis, instrument or index records
  | "current-package" // preview/audio/browse file of a current package with its source available
  | "unnamed"; // no record in any project names it

export type MediaFileEntry = {
  path: string; bytes: number; allocated: number; bucket: MediaBucket; reason: MediaReason;
  /** Up to three records that name the file, relative to the projects root. */
  named_by?: string[];
  /** An unnamed prepared file whose source is still available, so preparation can recreate it. */
  regenerable?: boolean;
};

export type FolderEntry = { path: string; bytes: number; allocated: number; owner: string };

export type ProjectStorage = {
  project_id: string;
  allocated: number; bytes: number;
  buckets: Record<MediaBucket, { allocated: number; bytes: number; files: number }>;
  reasons: Partial<Record<MediaReason, { allocated: number; files: number }>>;
  folders: FolderEntry[];
  files: MediaFileEntry[];
  symlinks: string[];
};

export type StorageReport = {
  schema_version: 1;
  projects_root: string;
  volume?: { free: number; total: number };
  shared_caches: FolderEntry[];
  projects: ProjectStorage[];
  limits: string[];
};

type RecordKind = "edit" | "evidence";
type Size = { bytes: number; allocated: number };

const MEDIA_URL = /\/api\/projects\/([^/?#"\s]+)\/media\/([^?#"\s]+)/g;
const STRING_LITERAL = /"((?:[^"\\\n]|\\.){1,2048})"/g;
const PREPARED_FILE = /^\.prepared\/[^/]+\/([0-9a-f]{64})\//;

const EDIT_RECORDS = /^(timeline\.json|metadata\.json|storyboard\.json|workspace-selection\.json|history\/|proposals\/|archive\/|assemblies\/|timeline-tombstones)/;
/** Owner of each top-level project entry, from the storage lifecycle contract's classes. */
const FOLDER_OWNERS: [RegExp, string][] = [
  [/^media$/, "media (classified per file)"],
  [/^preprocess\/export-chunks$/, "rebuildable: latest export's chunk cache"],
  [/^(history|proposals|archive)$/, "edit records (undo, review and recovery)"],
  [/^renders$/, "exports (creator output; render-audit rules apply)"],
  [/^(analysis|instruments|memory|review|preprocess|media-analysis|audit)$/, "analysis and evidence records (not classified per file)"],
];

function decode(value: string) { try { return decodeURIComponent(value); } catch { return value; } }

function sizeOf(stat: fs.Stats): Size { return { bytes: stat.size, allocated: stat.blocks * 512 }; }

function folderSize(dir: string): Size {
  const total = { bytes: 0, allocated: 0 };
  const pending = [dir];
  while (pending.length) {
    const current = pending.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(file);
      else if (entry.isFile()) { try { const s = sizeOf(fs.lstatSync(file)); total.bytes += s.bytes; total.allocated += s.allocated; } catch { /* Vanished. */ } }
    }
  }
  return total;
}

function* recordFiles(dir: string): Generator<string> {
  const pending = [dir];
  while (pending.length) {
    const current = pending.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) { if (entry.name !== "node_modules") pending.push(file); }
      else if (entry.isFile() && /\.(json|jsonl|ndjson)$/i.test(entry.name)) yield file;
    }
  }
}

/** Each string literal in a JSON/JSONL text, unescaped where needed. */
function* stringLiterals(text: string): Generator<string> {
  for (const match of text.matchAll(STRING_LITERAL)) {
    const raw = match[1];
    if (!raw.includes("\\")) { yield raw; continue; }
    try { yield JSON.parse(`"${raw}"`); } catch { yield raw.replace(/\\\//g, "/"); }
  }
}

type References = Map<string, Map<string, { kinds: Set<RecordKind>; records: string[] }>>;

function addReference(refs: References, mediaFiles: Map<string, Set<string>>, projectId: string, relative: string, kind: RecordKind, record: string) {
  const normalized = relative.replace(/^\.\//, "").replace(/^media\//, "");
  // Only paths of files that exist are worth holding; most strings name nothing on disk.
  if (!mediaFiles.get(projectId)?.has(normalized)) return;
  let project = refs.get(projectId);
  if (!project) refs.set(projectId, project = new Map());
  let entry = project.get(normalized);
  if (!entry) project.set(normalized, entry = { kinds: new Set(), records: [] });
  entry.kinds.add(kind);
  if (entry.records.length < 3 && !entry.records.includes(record)) entry.records.push(record);
}

/**
 * Collect what every record names. URLs (`/api/projects/<id>/media/...`) count for whichever project
 * they point at; bare relative paths count for the project that holds the record. Package records
 * (preprocess/media-preparation) are read separately, with their roles.
 */
function collectReferences(root: string, projectIds: string[], targets: Set<string>, mediaFiles: Map<string, Set<string>>): References {
  const refs: References = new Map();
  const needles = [...targets].map(id => Buffer.from(`/api/projects/${id}/media/`));
  for (const projectId of projectIds) {
    const projectRoot = path.join(root, projectId);
    const own = targets.has(projectId);
    for (const file of recordFiles(projectRoot)) {
      const inProject = path.relative(projectRoot, file).split(path.sep).join("/");
      if (inProject.startsWith("preprocess/media-preparation/")) continue;
      let bytes: Buffer;
      try { bytes = fs.readFileSync(file); } catch { continue; }
      // Another project's records only matter where they link into a reported project.
      if (!own && !needles.some(needle => bytes.indexOf(needle) >= 0)) continue;
      const kind: RecordKind = EDIT_RECORDS.test(inProject) ? "edit" : "evidence";
      const record = `${projectId}/${inProject}`;
      const mediaMarker = `/${projectId}/media/`;
      for (const value of stringLiterals(bytes.toString("utf8"))) {
        let linked = false;
        for (const match of value.matchAll(MEDIA_URL)) {
          linked = true;
          const target = decode(match[1]);
          if (targets.has(target)) addReference(refs, mediaFiles, target, decode(match[2]), kind, record);
        }
        if (linked || !own || value.length > 1024 || !/\.[A-Za-z0-9]{2,5}$/.test(value) || value.includes("://")) continue;
        // A bare path: project-media-relative, or absolute inside this project's media folder.
        const marker = value.lastIndexOf(mediaMarker);
        addReference(refs, mediaFiles, projectId, marker >= 0 ? value.slice(marker + mediaMarker.length) : value, kind, record);
      }
    }
  }
  return refs;
}

type PackageRole = "preview" | "render" | "audio" | "browse_preview" | "browse_audio" | "color_stage";
type PackageFile = { role: PackageRole; source: string; sourceAvailable: boolean };

function readPackages(projectRoot: string) {
  const files = new Map<string, PackageFile>();
  const availableHashes = new Set<string>();
  const dir = path.join(projectRoot, "preprocess", "media-preparation");
  let names: string[] = [];
  try { names = fs.readdirSync(dir).filter(name => name.endsWith(".json")); } catch { /* No packages. */ }
  for (const name of names) {
    let record: Record<string, unknown> & { browse_preview?: Record<string, unknown> };
    try { record = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")); } catch { continue; }
    const source = typeof record.source === "string" ? record.source : null;
    if (!source) continue;
    let sourceAvailable = false;
    try {
      const stat = fs.statSync(path.join(projectRoot, "media", source));
      sourceAvailable = stat.isFile() && stat.size === record.size && stat.mtimeMs === record.mtime;
    } catch { /* Source missing. */ }
    if (sourceAvailable) for (const hash of [record.source_hash, record.browse_preview?.source_hash]) if (typeof hash === "string") availableHashes.add(hash);
    const roles: [unknown, PackageRole][] = [[record.preview, "preview"], [record.render, "render"], [record.audio, "audio"],
      [record.browse_preview?.preview, "browse_preview"], [record.browse_preview?.audio, "browse_audio"], [record.browse_preview?.color_stage, "color_stage"]];
    for (const [file, role] of roles) {
      if (typeof file !== "string" || file === source) continue;
      // A file two packages share keeps its strongest role: a render authority stays one.
      if (files.get(file)?.role === "render") continue;
      files.set(file, { role, source, sourceAvailable });
    }
  }
  return { files, availableHashes };
}

function classify(relative: string, size: Size, originals: Set<string>, packages: ReturnType<typeof readPackages>,
  named: { kinds: Set<RecordKind>; records: string[] } | undefined): MediaFileEntry {
  const base = { path: relative, ...size };
  const by = named?.records.length ? { named_by: named.records } : {};
  if (originals.has(relative)) return { ...base, bucket: "referenced", reason: "original", ...by };
  if (named?.kinds.has("edit")) return { ...base, bucket: "referenced", reason: "edit", ...by };
  const pkg = packages.files.get(relative);
  if (pkg?.role === "render") return { ...base, bucket: "referenced", reason: "render-authority", named_by: [`package for ${pkg.source}`] };
  if (pkg) return pkg.sourceAvailable
    ? { ...base, bucket: "rebuildable", reason: "current-package", named_by: [`package for ${pkg.source}`] }
    : { ...base, bucket: "referenced", reason: "package-source-missing", named_by: [`package for ${pkg.source}`] };
  if (named) return { ...base, bucket: "referenced", reason: "evidence-only", ...by };
  const hash = relative.match(PREPARED_FILE)?.[1];
  return { ...base, bucket: "orphaned", reason: "unnamed", ...(hash && packages.availableHashes.has(hash) ? { regenerable: true } : {}) };
}

function readOriginals(projectRoot: string) {
  const originals = new Set<string>();
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "source-manifest.json"), "utf8")) as { assets?: { media_path?: unknown }[] };
    for (const asset of manifest.assets ?? []) if (typeof asset.media_path === "string") originals.add(asset.media_path);
  } catch { /* No manifest. */ }
  return originals;
}

type MediaWalk = { files: Map<string, Size>; symlinks: string[] };

function walkMedia(projectRoot: string): MediaWalk {
  const files = new Map<string, Size>();
  const symlinks: string[] = [];
  const mediaRoot = path.join(projectRoot, "media");
  const pending = [mediaRoot];
  while (pending.length) {
    const dir = pending.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      const relative = path.relative(mediaRoot, file).split(path.sep).join("/");
      if (entry.isSymbolicLink()) { symlinks.push(relative); continue; }
      if (entry.isDirectory()) { pending.push(file); continue; }
      if (!entry.isFile()) continue;
      try { files.set(relative, sizeOf(fs.lstatSync(file))); } catch { /* Vanished. */ }
    }
  }
  return { files, symlinks };
}

function projectStorage(root: string, projectId: string, media: MediaWalk, refs: References): ProjectStorage {
  const projectRoot = path.join(root, projectId);
  const packages = readPackages(projectRoot);
  const originals = readOriginals(projectRoot);
  const named = refs.get(projectId) ?? new Map();
  const symlinks = media.symlinks;
  const files = [...media.files].map(([relative, size]) => classify(relative, size, originals, packages, named.get(relative)));
  files.sort((a, b) => b.allocated - a.allocated);
  const buckets = { referenced: { allocated: 0, bytes: 0, files: 0 }, rebuildable: { allocated: 0, bytes: 0, files: 0 }, orphaned: { allocated: 0, bytes: 0, files: 0 } };
  const reasons: ProjectStorage["reasons"] = {};
  for (const file of files) {
    const bucket = buckets[file.bucket];
    bucket.allocated += file.allocated; bucket.bytes += file.bytes; bucket.files++;
    const reason = reasons[file.reason] ??= { allocated: 0, files: 0 };
    reason.allocated += file.allocated; reason.files++;
  }
  const folders: FolderEntry[] = [];
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(projectRoot, { withFileTypes: true }); } catch { /* Unreadable project. */ }
  const records = { bytes: 0, allocated: 0 };
  for (const entry of entries) {
    const file = path.join(projectRoot, entry.name);
    if (entry.name === "media") continue;
    if (entry.isFile()) { const s = sizeOf(fs.lstatSync(file)); records.bytes += s.bytes; records.allocated += s.allocated; continue; }
    if (!entry.isDirectory()) continue;
    if (entry.name === "preprocess") {
      const chunks = path.join(file, "export-chunks");
      const chunkSize = fs.existsSync(chunks) ? folderSize(chunks) : { bytes: 0, allocated: 0 };
      const all = folderSize(file);
      if (chunkSize.allocated) folders.push({ path: "preprocess/export-chunks", ...chunkSize, owner: FOLDER_OWNERS[1][1] });
      folders.push({ path: "preprocess", bytes: all.bytes - chunkSize.bytes, allocated: all.allocated - chunkSize.allocated, owner: FOLDER_OWNERS[4][1] });
      continue;
    }
    const owner = FOLDER_OWNERS.find(([pattern]) => pattern.test(entry.name))?.[1] ?? "unclassified project folder";
    folders.push({ path: entry.name, ...folderSize(file), owner });
  }
  folders.push({ path: "(top-level records)", ...records, owner: "edit records (undo, review and recovery)" });
  folders.sort((a, b) => b.allocated - a.allocated);
  const mediaTotal = buckets.referenced.allocated + buckets.rebuildable.allocated + buckets.orphaned.allocated;
  const mediaBytes = buckets.referenced.bytes + buckets.rebuildable.bytes + buckets.orphaned.bytes;
  return {
    project_id: projectId,
    allocated: mediaTotal + folders.reduce((sum, f) => sum + f.allocated, 0),
    bytes: mediaBytes + folders.reduce((sum, f) => sum + f.bytes, 0),
    buckets, reasons, folders, files, symlinks,
  };
}

export function listProjectIds(root: string): string[] {
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.name.startsWith(".") && fs.existsSync(path.join(root, entry.name, "timeline.json")))
      .map(entry => entry.name).sort();
  } catch { return []; }
}

export function buildStorageReport(root: string, only?: string[]): StorageReport {
  const projectIds = listProjectIds(root);
  const targets = new Set(only?.length ? only : projectIds);
  for (const id of targets) if (!projectIds.includes(id)) throw new Error(`No project named ${id} under ${root}`);
  const media = new Map([...targets].map(id => [id, walkMedia(path.join(root, id))]));
  const refs = collectReferences(root, projectIds, targets, new Map([...media].map(([id, walk]) => [id, new Set(walk.files.keys())])));
  let volume: StorageReport["volume"];
  try { const s = fs.statfsSync(root); volume = { free: s.bavail * s.bsize, total: s.blocks * s.bsize }; } catch { /* Unknown. */ }
  const sharedCaches: FolderEntry[] = [];
  const thumbnails = path.join(root, ".cache", "thumbnails");
  if (fs.existsSync(thumbnails)) sharedCaches.push({ path: ".cache/thumbnails", ...folderSize(thumbnails), owner: "rebuildable: browsing thumbnails (512 MiB LRU)" });
  return {
    schema_version: 1,
    projects_root: root,
    volume,
    shared_caches: sharedCaches,
    projects: [...targets].sort().map(id => projectStorage(root, id, media.get(id)!, refs)),
    limits: [
      "Read-only: nothing was written or deleted.",
      "Orphaned means no record in any project names the file. It is a candidate for review, not proof that it is disposable.",
      "References are found by path text in JSON records; a reference held only in memory, a running job or a non-JSON file is not seen.",
      "Allocated sizes come from block counts. APFS clones and sparse files can make the sum exceed what deleting would free.",
      "Folders outside media/ are sized by owner only; their files are not classified.",
    ],
  };
}
