/**
 * Import filesystem media into a DreamCut project.
 * Managed byte copies are the default. External references require --external
 * or storage_mode: "external_reference" in the base64 request.
 */
import fs from "node:fs";
import path from "node:path";

import { ingestMediaPath, importedMediaUrl, type MediaStorageMode } from "@/lib/local-store/media-ingest";
import { isSafeProjectId, projectExists } from "@/lib/local-store/paths";
import { createProject } from "@/lib/local-store/store";
import type { DeliveryTarget } from "@/lib/qc/standards";
import { readPreparation } from "@/lib/local-store/media-preparation";
import { ScriptError, reportScriptFailure } from "./lib/script-error";

type ImportRequest = {
  project_id: string;
  source_paths: string[];
  storage_mode?: MediaStorageMode;
  create_if_missing?: boolean;
  title?: string;
  delivery_target?: DeliveryTarget;
};

const DELIVERY_TARGETS = new Set<DeliveryTarget>(["web", "feed", "reels", "tiktok", "shorts"]);

function decodeRequest(): ImportRequest {
  const encodedIndex = process.argv.indexOf("--request-base64");
  if (encodedIndex >= 0) {
    const encoded = process.argv[encodedIndex + 1];
    if (!encoded) throw new Error("--request-base64 requires a value");
    return JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as ImportRequest;
  }

  const args = process.argv.slice(2);
  const externalIndex = args.indexOf("--external");
  const storageMode: MediaStorageMode = externalIndex >= 0 ? "external_reference" : "managed_copy";
  if (externalIndex >= 0) args.splice(externalIndex, 1);
  const noCreateIndex = args.indexOf("--no-create");
  const createIfMissing = noCreateIndex < 0;
  if (noCreateIndex >= 0) args.splice(noCreateIndex, 1);
  const [projectId, ...sourcePaths] = args;
  if (!projectId || sourcePaths.length === 0) {
    throw new Error("Usage: pnpm import-media <project-id> <file...> [--external] [--no-create]");
  }
  return {
    project_id: projectId,
    source_paths: sourcePaths,
    storage_mode: storageMode,
    create_if_missing: createIfMissing,
  };
}

const FIX_INPUT = { action: "fix_arguments", reason: "Correct the named input; retrying unchanged fails the same way." };

function main() {
const request = decodeRequest();
if (!isSafeProjectId(request.project_id)) throw new ScriptError("INVALID_INPUT", `Invalid project id: ${request.project_id}`, FIX_INPUT);
if (!Array.isArray(request.source_paths) || request.source_paths.length === 0) {
  throw new ScriptError("INVALID_INPUT", "source_paths must contain at least one file", FIX_INPUT);
}
const storageMode = request.storage_mode ?? "managed_copy";
if (storageMode !== "managed_copy" && storageMode !== "external_reference") {
  throw new ScriptError("INVALID_INPUT", `Unsupported storage mode: ${String(storageMode)}`, FIX_INPUT);
}
const deliveryTarget = request.delivery_target ?? "web";
if (!DELIVERY_TARGETS.has(deliveryTarget)) throw new ScriptError("INVALID_INPUT", `Invalid delivery target: ${deliveryTarget}`, FIX_INPUT);

// Errors name each source as the caller wrote it, not its resolved absolute form.
const sourcePaths = request.source_paths.map((sourcePath) => path.resolve(sourcePath));
sourcePaths.forEach((sourcePath, index) => {
  const named = request.source_paths[index];
  let stat: fs.Stats;
  try {
    stat = fs.statSync(sourcePath);
  } catch {
    throw new ScriptError("SOURCE_NOT_FOUND", `Missing media source: ${named}`, { action: "check_source_path", reason: "Confirm the file exists and pass its absolute path; nothing was imported." });
  }
  if (!stat.isFile()) throw new ScriptError("SOURCE_NOT_A_FILE", `Media source is not a file: ${named}`, { action: "check_source_path", reason: "Pass individual media files, not folders; nothing was imported." });
});

const existed = projectExists(request.project_id);
if (!existed) {
  if (request.create_if_missing === false) throw new ScriptError("PROJECT_NOT_FOUND", `Project not found: ${request.project_id}`, { action: "check_project_id", reason: "Use an existing project id, or allow create_if_missing." });
  createProject(request.project_id, deliveryTarget, request.title ?? request.project_id);
}

const assets = sourcePaths.map((sourcePath) => {
  const asset = ingestMediaPath({
    projectId: request.project_id,
    sourcePath,
    storageMode,
  });
  return { ...asset, source_url: importedMediaUrl(request.project_id, asset), preparation: readPreparation(request.project_id, asset.media_path) };
});

process.stdout.write(`${JSON.stringify({
  project_id: request.project_id,
  created_project: !existed,
  storage_mode: storageMode,
  asset_count: assets.length,
  manifest: `projects/${request.project_id}/source-manifest.json`,
  assets,
})}\n`);
}

try {
  main();
} catch (error) {
  reportScriptFailure(error, "IMPORT_FAILED");
}
