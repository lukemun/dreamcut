import fs from "node:fs";
import path from "node:path";

import { motionSubjectFromSourceUrl, type MotionSubject } from "@/lib/hyperframes/motion-media";
import { MANIFEST_FILE_NAME } from "@/lib/hyperframes/composition-manifest";
import { LOOKS_FILE, controlsTextUsesSharedLooks } from "@/lib/hyperframes/look-bundle";

import { readJsonFile } from "./atomic-json";
import { validateHyperframesOverlayReceipt, type HyperframesOverlayReceipt } from "./hyperframes-overlays";
import {
  isSafeHyperframesCompositionId,
  projectDir,
  projectHyperframesCompositionDir,
  projectHyperframesReceiptsDir,
  projectMediaDir,
} from "./paths";

/**
 * Agent-authored composition sources and value-keyed candidate renders.
 *
 * A candidate render is preparation, not approval: the proposal that places it is the
 * approval point. Each (source fingerprint, control values) pair renders once; tuning
 * back to an earlier value set reuses its file.
 */

export type CompositionSourceFile = { path: string; text: string };
export type CompositionAssetCopy = { media_path: string; as: string };
export type CompositionSourceSpec = {
  files: CompositionSourceFile[];
  assets?: CompositionAssetCopy[];
};

const ALLOWED_SOURCE_EXTENSION = /\.(?:html|css|js|mjs|json|svg|txt)$/i;
const MAX_SOURCE_FILES = 64;
const MAX_SOURCE_BYTES = 2_000_000;
const MAX_ASSET_BYTES = 200 * 1024 * 1024;
const RESERVED_SEGMENTS = new Set(["node_modules", "renders", ".git", ".hyperframes", "snapshots"]);

/** Minimal HyperFrames project files written once when the agent supplies only its own sources. */
const DEFAULT_PROJECT_FILES: Record<string, (id: string) => string> = {
  "hyperframes.json": () => `${JSON.stringify({
    $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
    registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
    paths: { blocks: "compositions", components: "compositions/components", assets: "assets" },
    media: { autoProxy: true },
  }, null, 2)}\n`,
  "meta.json": (id) => `${JSON.stringify({ id, name: id }, null, 2)}\n`,
};

export function safeCompositionRelativePath(value: string, extensions: RegExp): string {
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
  const segments = normalized.split("/");
  if (value.length === 0 || value.length > 200 || path.posix.isAbsolute(normalized) || normalized.startsWith("..")
    || segments.some((segment) => segment === "" || segment === "." || segment === ".." || segment.startsWith(".")
      || RESERVED_SEGMENTS.has(segment))
    || !extensions.test(normalized)) {
    throw new Error(`Unsupported composition file path: ${value}`);
  }
  return normalized;
}

/**
 * Validate a composition spec. A revision may send only the files that changed (or only assets);
 * whether index.html must be among them depends on the composition existing, which
 * `missingEntryProblem` checks against the project.
 */
export function parseCompositionSourceSpec(raw: unknown): CompositionSourceSpec {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Composition spec must be an object");
  const spec = raw as Record<string, unknown>;
  const listed = spec.files === undefined ? [] : spec.files;
  if (!Array.isArray(listed) || listed.length > MAX_SOURCE_FILES) {
    throw new Error(`files must list at most ${MAX_SOURCE_FILES} source files`);
  }
  let bytes = 0;
  const seen = new Set<string>();
  const files = listed.map((file) => {
    const entry = file as Record<string, unknown>;
    if (typeof entry?.path !== "string" || typeof entry.text !== "string") throw new Error("Each file needs path and text");
    const relative = safeCompositionRelativePath(entry.path, ALLOWED_SOURCE_EXTENSION);
    if (seen.has(relative)) throw new Error(`Duplicate file: ${relative}`);
    seen.add(relative);
    bytes += Buffer.byteLength(entry.text);
    return { path: relative, text: entry.text };
  });
  if (bytes > MAX_SOURCE_BYTES) throw new Error("Composition source files exceed 2 MB");
  const assets = spec.assets === undefined ? [] : spec.assets;
  if (!Array.isArray(assets) || assets.length > MAX_SOURCE_FILES) throw new Error("assets must be a list");
  if (files.length === 0 && assets.length === 0) throw new Error("files or assets must list at least one entry; omit both to re-render the existing source");
  return {
    files,
    assets: assets.map((asset) => {
      const entry = asset as Record<string, unknown>;
      if (typeof entry?.media_path !== "string" || typeof entry.as !== "string") throw new Error("Each asset needs media_path and as");
      const as = safeCompositionRelativePath(entry.as, /\.[a-z0-9]{2,5}$/i);
      if (!as.startsWith("assets/")) throw new Error(`Asset destination must be under assets/: ${entry.as}`);
      return { media_path: entry.media_path, as };
    }),
  };
}

/**
 * Write the agent's source files and copy project media into assets/. Files the spec
 * does not mention are left unchanged; the source fingerprint records the result.
 */
/** The refusal for a spec that would leave the composition without index.html, or null. */
export function missingEntryProblem(projectId: string, compositionId: string, spec: CompositionSourceSpec): string | null {
  if (spec.files.some((file) => file.path === "index.html")) return null;
  if (fs.existsSync(path.join(projectHyperframesCompositionDir(projectId, compositionId), "index.html"))) return null;
  return `files must include index.html: composition ${compositionId} does not exist yet. A revision may send only the files that changed.`;
}

export function writeCompositionSource(projectId: string, compositionId: string, spec: CompositionSourceSpec): string {
  const missing = missingEntryProblem(projectId, compositionId, spec);
  if (missing) throw new Error(missing);
  const directory = projectHyperframesCompositionDir(projectId, compositionId);
  fs.mkdirSync(directory, { recursive: true });
  for (const [name, content] of Object.entries(DEFAULT_PROJECT_FILES)) {
    const target = path.join(directory, name);
    if (!fs.existsSync(target)) fs.writeFileSync(target, content(compositionId));
  }
  const mediaRoot = fs.realpathSync(projectMediaDir(projectId));
  for (const asset of spec.assets ?? []) {
    const sourcePath = path.resolve(mediaRoot, asset.media_path);
    let real: string;
    try {
      real = fs.realpathSync(sourcePath);
    } catch {
      throw new Error(`Project media not found: ${asset.media_path}`);
    }
    if (!real.startsWith(`${mediaRoot}${path.sep}`) || !fs.statSync(real).isFile()) {
      throw new Error(`Asset must be a file inside this project's media: ${asset.media_path}`);
    }
    if (fs.statSync(real).size > MAX_ASSET_BYTES) throw new Error(`Asset is larger than 200 MB: ${asset.media_path}`);
    const target = path.join(directory, asset.as);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(real, target);
  }
  // A template that works with looks never stores looks.js: DreamCut supplies the runtime, kit and
  // the chosen look when it checks, previews and renders. One sent anyway is dropped, and an old
  // copy from before this rule is removed so it cannot shadow the supplied bundle.
  const controls = spec.files.find((file) => file.path === MANIFEST_FILE_NAME)?.text
    ?? (fs.existsSync(path.join(directory, MANIFEST_FILE_NAME)) ? fs.readFileSync(path.join(directory, MANIFEST_FILE_NAME), "utf8") : null);
  const sharedLooks = controls !== null && controlsTextUsesSharedLooks(controls);
  for (const file of spec.files) {
    if (sharedLooks && file.path === LOOKS_FILE) continue;
    const target = path.join(directory, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.text);
  }
  if (sharedLooks) fs.rmSync(path.join(directory, LOOKS_FILE), { force: true });
  return directory;
}

function candidateDir(projectId: string, compositionId: string): string {
  if (!isSafeHyperframesCompositionId(compositionId)) throw new Error(`Invalid composition id: ${compositionId}`);
  return path.join(projectHyperframesReceiptsDir(projectId), "renders", compositionId);
}

/** No-controls renders key on the source alone. */
export const NO_VALUES_KEY = "none";

export function candidateReceiptPath(
  projectId: string,
  compositionId: string,
  sourceFingerprint: string,
  valuesKey: string,
): string {
  return path.join(candidateDir(projectId, compositionId), `${sourceFingerprint.slice(0, 16)}-${valuesKey.slice(0, 16)}.json`);
}

/** A previously rendered candidate for this exact source and values, if its output still exists. */
export function findCandidateRender(
  projectId: string,
  compositionId: string,
  sourceFingerprint: string,
  valuesKey: string,
  /** The values' own hash when the cache key also covers other inputs (a looks template's look code). */
  valuesSha = valuesKey,
): HyperframesOverlayReceipt | null {
  const receipt = readJsonFile<unknown>(candidateReceiptPath(projectId, compositionId, sourceFingerprint, valuesKey), null);
  try {
    validateHyperframesOverlayReceipt(receipt);
  } catch {
    return null;
  }
  if (receipt.source.fingerprint_sha256 !== sourceFingerprint) return null;
  if ((receipt.parameters?.values_sha256 ?? NO_VALUES_KEY).slice(0, 16) !== valuesSha.slice(0, 16)) return null;
  return fs.existsSync(path.join(projectDir(projectId), receipt.output.project_relative_path)) ? receipt : null;
}

/** All value-keyed renders for a composition, newest first. */
export function listCandidateRenders(projectId: string, compositionId: string): HyperframesOverlayReceipt[] {
  let names: string[];
  try {
    names = fs.readdirSync(candidateDir(projectId, compositionId));
  } catch {
    return [];
  }
  return names.filter((name) => name.endsWith(".json")).flatMap((name) => {
    const receipt = readJsonFile<unknown>(path.join(candidateDir(projectId, compositionId), name), null);
    try {
      validateHyperframesOverlayReceipt(receipt);
      return [receipt];
    } catch {
      return [];
    }
  }).sort((a, b) => b.render.rendered_at.localeCompare(a.render.rendered_at));
}

/** Map a project media URL or path under media/hyperframes/ or media/sounds/ to its motion subject. */
export function motionSubjectForMedia(projectId: string, sourceUrl: string): MotionSubject | null {
  const prefix = `/api/projects/${projectId}/media/`;
  return sourceUrl.startsWith("/api/") && !sourceUrl.startsWith(prefix) ? null : motionSubjectFromSourceUrl(sourceUrl);
}
