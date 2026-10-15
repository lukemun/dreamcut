import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";
import { mediaUrl } from "./media";
import { projectMediaDir, projectSourceManifestPath } from "./paths";
import { assertProject } from "./store";
import { enqueueImportJob } from "./media-import-jobs";
import { enqueueMediaPreparation } from "./media-preparation";

export type MediaStorageMode = "managed_copy" | "external_reference";

export type ProjectSourceAsset = {
  asset_id: string;
  original_filename: string;
  source_path: string | null;
  storage_mode: MediaStorageMode;
  media_path: string;
  source_sha256: string;
  bytes: number;
  imported_at: string;
  /** Present for kept generation results: the service and model that made them. */
  generation?: GenerationProvenance;
};
export type GenerationProvenance = {
  service: string; model: string; request_id: string;
  endpoint?: string; cloud_generation_id?: string; credits?: number;
};

export type ProjectSourceManifest = {
  schema_version: 1;
  project_id: string;
  updated_at: string;
  assets: ProjectSourceAsset[];
};

const EMPTY_MANIFEST = (projectId: string): ProjectSourceManifest => ({
  schema_version: 1,
  project_id: projectId,
  updated_at: new Date(0).toISOString(),
  assets: [],
});

export function safeMediaFileName(name: string): string {
  const base = path.basename(name).replace(/[^A-Za-z0-9._ -]/g, "_");
  if (base.length === 0) return "imported-media";
  return base.startsWith(".") ? `_${base.slice(1) || "imported-media"}` : base;
}

function sha256Buffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash("sha256");
  const descriptor = fs.openSync(filePath, "r");
  const chunk = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const bytes = fs.readSync(descriptor, chunk, 0, chunk.length, null);
      if (bytes === 0) break;
      hash.update(chunk.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest("hex");
}

function safeDestinationDir(value: string): string {
  const normalized = path.normalize(value || "sources");
  if (path.isAbsolute(normalized) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new Error("Media destination must stay inside the project media directory");
  }
  return normalized;
}

function availableTargetPath(directory: string, requestedName: string): string {
  const safeName = safeMediaFileName(requestedName);
  const extension = path.extname(safeName);
  const stem = path.basename(safeName, extension);
  let candidate = path.join(directory, safeName);
  for (let suffix = 2; fs.existsSync(candidate); suffix += 1) {
    candidate = path.join(directory, `${stem}-${suffix}${extension}`);
  }
  return candidate;
}

export function readProjectSourceManifest(projectId: string): ProjectSourceManifest {
  assertProject(projectId);
  const manifest = readJsonFile<ProjectSourceManifest>(
    projectSourceManifestPath(projectId),
    EMPTY_MANIFEST(projectId),
  );
  // Library contract: a newer manifest is never reinterpreted or rewritten in an older shape.
  if (typeof manifest.schema_version === "number" && manifest.schema_version > 1) {
    throw Object.assign(new Error(`This project's media list was saved by a newer DreamCut (version ${manifest.schema_version}). Update DreamCut to open it.`), { status: 409 });
  }
  if (manifest.schema_version !== 1 || manifest.project_id !== projectId || !Array.isArray(manifest.assets)) {
    throw new Error(`Invalid source manifest for project: ${projectId}`);
  }
  return manifest;
}

function registerAsset(projectId: string, asset: ProjectSourceAsset): ProjectSourceAsset {
  const manifest = readProjectSourceManifest(projectId);
  writeJsonFileAtomic(projectSourceManifestPath(projectId), {
    ...manifest,
    updated_at: asset.imported_at,
    assets: [...manifest.assets, asset],
  } satisfies ProjectSourceManifest);
  enqueueMediaPreparation(projectId, asset.media_path);
  if (/\.(png|jpe?g|webp|gif|heic|mov|mp4|m4v|webm|wav|mp3|m4a|aac|flac|ogg)$/i.test(asset.media_path)) enqueueImportJob(projectId, asset);
  return asset;
}

/** Only clean up this invocation's new file when durable state proves it was
 * never registered. Atomic rename can succeed before a later flush/job fails. */
function registerNewMedia(projectId: string, asset: ProjectSourceAsset, ownedPath: string): ProjectSourceAsset {
  try { return registerAsset(projectId, asset); }
  catch (error) {
    let uncommitted = false;
    try {
      const manifest = JSON.parse(fs.readFileSync(projectSourceManifestPath(projectId), "utf8"));
      uncommitted = manifest?.schema_version === 1 && manifest.project_id === projectId
        && Array.isArray(manifest.assets) && !manifest.assets.some((entry: ProjectSourceAsset) => entry?.asset_id === asset.asset_id);
    } catch (readError) {
      uncommitted = (readError as NodeJS.ErrnoException).code === "ENOENT";
    }
    if (uncommitted) fs.unlinkSync(ownedPath); // Unlinks external references, never their originals.
    throw error;
  }
}

function existingPathImport(
  projectId: string,
  sourcePath: string,
  storageMode: MediaStorageMode,
  sourceSha256: string,
): ProjectSourceAsset | null {
  const match = readProjectSourceManifest(projectId).assets.find((asset) =>
    asset.source_path === sourcePath
    && asset.storage_mode === storageMode
    && asset.source_sha256 === sourceSha256,
  );
  if (!match) return null;
  const managedPath = path.join(projectMediaDir(projectId), match.media_path);
  return fs.existsSync(managedPath) ? match : null;
}

export function ingestMediaPath(options: {
  projectId: string;
  sourcePath: string;
  storageMode?: MediaStorageMode;
  destinationDir?: string;
  expectedSourceSha256?: string;
  generation?: GenerationProvenance;
}): ProjectSourceAsset {
  assertProject(options.projectId);
  const sourcePath = path.resolve(options.sourcePath);
  const sourceStat = fs.statSync(sourcePath);
  if (!sourceStat.isFile()) throw new Error(`Media source is not a file: ${sourcePath}`);

  const storageMode = options.storageMode ?? "managed_copy";
  const sourceSha256 = sha256File(sourcePath);
  if (options.expectedSourceSha256 !== undefined && sourceSha256 !== options.expectedSourceSha256) {
    throw new Error("Media source checksum does not match the expected catalog revision");
  }
  const existing = existingPathImport(options.projectId, sourcePath, storageMode, sourceSha256);
  if (existing) { enqueueMediaPreparation(options.projectId, existing.media_path); return existing; }

  const destinationDir = path.join(
    projectMediaDir(options.projectId),
    safeDestinationDir(options.destinationDir ?? "sources"),
  );
  fs.mkdirSync(destinationDir, { recursive: true });
  const targetPath = availableTargetPath(destinationDir, path.basename(sourcePath));

  if (storageMode === "external_reference") {
    fs.symlinkSync(sourcePath, targetPath, process.platform === "win32" ? "file" : undefined);
  } else {
    const temporaryPath = `${targetPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      fs.copyFileSync(sourcePath, temporaryPath, fs.constants.COPYFILE_EXCL);
      if (sha256File(temporaryPath) !== sourceSha256) {
        throw new Error(`Copied media failed checksum verification: ${sourcePath}`);
      }
      const after = fs.statSync(sourcePath);
      if (after.size !== sourceStat.size || after.mtimeMs !== sourceStat.mtimeMs) {
        throw new Error(`Media source changed during import: ${sourcePath}`);
      }
      fs.renameSync(temporaryPath, targetPath);
    } catch (error) {
      fs.rmSync(temporaryPath, { force: true });
      throw error;
    }
  }

  const importedAt = new Date().toISOString();
  return registerNewMedia(options.projectId, {
    asset_id: crypto.randomUUID(),
    original_filename: path.basename(sourcePath),
    source_path: sourcePath,
    storage_mode: storageMode,
    media_path: path.relative(projectMediaDir(options.projectId), targetPath),
    source_sha256: sourceSha256,
    bytes: sourceStat.size,
    imported_at: importedAt,
    ...(options.generation ? { generation: options.generation } : {}),
  }, targetPath);
}

/** Browser uploads expose bytes and a filename, but not a trustworthy local source path. */
export function ingestMediaBuffer(options: {
  projectId: string;
  buffer: Buffer;
  originalFilename: string;
  destinationDir?: string;
}): ProjectSourceAsset {
  assertProject(options.projectId);
  const destinationDir = path.join(
    projectMediaDir(options.projectId),
    safeDestinationDir(options.destinationDir ?? "sources"),
  );
  fs.mkdirSync(destinationDir, { recursive: true });
  const targetPath = availableTargetPath(destinationDir, options.originalFilename);
  fs.writeFileSync(targetPath, options.buffer, { flag: "wx" });
  const importedAt = new Date().toISOString();
  return registerNewMedia(options.projectId, {
    asset_id: crypto.randomUUID(),
    original_filename: path.basename(options.originalFilename),
    source_path: null,
    storage_mode: "managed_copy",
    media_path: path.relative(projectMediaDir(options.projectId), targetPath),
    source_sha256: sha256Buffer(options.buffer),
    bytes: options.buffer.byteLength,
    imported_at: importedAt,
  }, targetPath);
}

export function importedMediaUrl(projectId: string, asset: ProjectSourceAsset): string {
  return mediaUrl(projectId, asset.media_path);
}
