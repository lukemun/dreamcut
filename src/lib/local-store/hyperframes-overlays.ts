import type { ResolvedTiming } from "@/lib/hyperframes/composition-timing";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { readJsonFile } from "./atomic-json";
import {
  isSafeHyperframesCompositionId,
  projectDir,
  projectHyperframesReceiptsDir,
} from "./paths";

const SHA256_RE = /^[a-f0-9]{64}$/;
const IGNORED_SOURCE_DIRECTORIES = new Set([".git", ".hyperframes", "node_modules", "renders"]);

export type HyperframesOverlayReceipt = {
  schema_version: 1;
  composition_id: string;
  source: {
    project_relative_directory: string;
    fingerprint_sha256: string;
  };
  output: {
    project_relative_path: string;
    sha256: string;
    duration_seconds: number;
    width: number;
    height: number;
    fps: number;
    codec: string;
    pixel_format: string | null;
    alpha_mode: "1";
  };
  render: {
    hyperframes_version: string;
    rendered_at: string;
    quality: "high";
    format: "webm";
    /** True when a person approved this render directly; false for a candidate a proposal will review. */
    approved: boolean;
  };
  /** Present when the composition declares a controls file; values were injected at render. */
  parameters?: {
    manifest_sha256: string;
    values_sha256: string;
    values: Record<string, string | number | boolean>;
    segment_durations: Record<string, number>;
    /** The render's declared length and cue times for these values, when the composition declares timing. */
    timing?: ResolvedTiming;
  };
};

export type HyperframesCompositionState =
  | "draft"
  | "current"
  | "source_changed"
  | "render_missing"
  | "source_missing";

export type HyperframesCompositionSummary = {
  composition_id: string;
  source_directory: string;
  source_fingerprint_sha256: string | null;
  rendered_source_fingerprint_sha256: string | null;
  state: HyperframesCompositionState;
  output_path: string | null;
  output_sha256: string | null;
  duration_seconds: number | null;
  rendered_at: string | null;
};

function isSafeProjectRelativePath(value: string): boolean {
  if (value.length === 0 || path.isAbsolute(value)) return false;
  const normalized = path.posix.normalize(value.replaceAll(path.sep, "/"));
  return normalized !== ".." && !normalized.startsWith("../");
}

export function validateHyperframesOverlayReceipt(value: unknown): asserts value is HyperframesOverlayReceipt {
  if (!value || typeof value !== "object") throw new Error("Invalid HyperFrames overlay receipt");
  const receipt = value as HyperframesOverlayReceipt;
  if (receipt.schema_version !== 1) throw new Error("Unsupported HyperFrames overlay receipt schema");
  if (!isSafeHyperframesCompositionId(receipt.composition_id)) throw new Error("Invalid HyperFrames composition id");
  if (!receipt.source || !isSafeProjectRelativePath(receipt.source.project_relative_directory)
    || receipt.source.project_relative_directory !== `hyperframes/${receipt.composition_id}`
    || !SHA256_RE.test(receipt.source.fingerprint_sha256)) {
    throw new Error("Invalid HyperFrames source identity");
  }
  if (!receipt.output || !isSafeProjectRelativePath(receipt.output.project_relative_path)
    || !receipt.output.project_relative_path.startsWith(`media/hyperframes/${receipt.composition_id}/`)
    || !SHA256_RE.test(receipt.output.sha256)
    || !Number.isFinite(receipt.output.duration_seconds) || receipt.output.duration_seconds <= 0
    || !Number.isInteger(receipt.output.width) || receipt.output.width <= 0
    || !Number.isInteger(receipt.output.height) || receipt.output.height <= 0
    || !Number.isFinite(receipt.output.fps) || receipt.output.fps <= 0
    || receipt.output.alpha_mode !== "1") {
    throw new Error("Invalid HyperFrames overlay output");
  }
  if (receipt.render?.format !== "webm" || receipt.render.quality !== "high"
    || typeof receipt.render.approved !== "boolean" || !receipt.render.hyperframes_version
    || Number.isNaN(Date.parse(receipt.render.rendered_at))) {
    throw new Error("Invalid HyperFrames overlay render receipt");
  }
  if (receipt.parameters !== undefined) {
    const parameters = receipt.parameters;
    if (!parameters || !SHA256_RE.test(parameters.manifest_sha256) || !SHA256_RE.test(parameters.values_sha256)
      || !parameters.values || typeof parameters.values !== "object" || Array.isArray(parameters.values)
      || !parameters.segment_durations || typeof parameters.segment_durations !== "object"
      || !Object.values(parameters.segment_durations).every((value) => Number.isFinite(value) && value > 0)) {
      throw new Error("Invalid HyperFrames overlay parameters");
    }
    const timing = parameters.timing;
    if (timing !== undefined && (!timing || typeof timing !== "object"
      || !(timing.duration === null || (Number.isFinite(timing.duration) && timing.duration > 0))
      || !timing.cues || typeof timing.cues !== "object" || Array.isArray(timing.cues)
      || !Object.values(timing.cues).every((value) => Number.isFinite(value) && value >= 0))) {
      throw new Error("Invalid HyperFrames overlay timing");
    }
  }
}

function sourceFiles(directory: string, base = directory): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".npmrc") continue;
    if (entry.isDirectory() && IGNORED_SOURCE_DIRECTORIES.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(absolute, base));
    else if (entry.isFile()) files.push(path.relative(base, absolute));
  }
  return files.sort();
}

export function hyperframesSourceFileHashes(directory: string): Array<{ path: string; sha256: string }> {
  return sourceFiles(directory).map((relative) => ({
    path: relative.replaceAll(path.sep, "/"),
    sha256: createHash("sha256").update(fs.readFileSync(path.join(directory, relative))).digest("hex"),
  }));
}

const TEXT_SOURCE_RE = /\.(?:html?|m?js|css|json)$/i;
const MAX_TEXT_SOURCE_BYTES = 2_000_000;

/** Text sources (HTML, JS, CSS, JSON) for static validation; large or binary files are skipped. */
export function readHyperframesTextSources(directory: string): Array<{ path: string; text: string }> {
  return sourceFiles(directory).flatMap((relative) => {
    if (!TEXT_SOURCE_RE.test(relative)) return [];
    const absolute = path.join(directory, relative);
    if (fs.statSync(absolute).size > MAX_TEXT_SOURCE_BYTES) return [];
    return [{ path: relative.replaceAll(path.sep, "/"), text: fs.readFileSync(absolute, "utf8") }];
  });
}

export function fingerprintHyperframesSource(directory: string): string {
  const hash = createHash("sha256");
  for (const relative of sourceFiles(directory)) {
    hash.update(relative.replaceAll(path.sep, "/"));
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(directory, relative)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function readValidReceipts(projectId: string): HyperframesOverlayReceipt[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(projectHyperframesReceiptsDir(projectId), { withFileTypes: true });
  } catch {
    return [];
  }

  const receipts: HyperframesOverlayReceipt[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const receipt = readJsonFile<unknown>(path.join(projectHyperframesReceiptsDir(projectId), entry.name), null);
    try {
      validateHyperframesOverlayReceipt(receipt);
      receipts.push(receipt);
    } catch {
      // Invalid or partial receipts never become project state.
    }
  }
  return receipts.sort((a, b) => a.composition_id.localeCompare(b.composition_id));
}

export function listHyperframesOverlayReceipts(projectId: string): HyperframesOverlayReceipt[] {
  const projectRoot = projectDir(projectId);
  return readValidReceipts(projectId).filter((receipt) => {
    try {
      const outputPath = path.resolve(projectRoot, receipt.output.project_relative_path);
      return outputPath.startsWith(`${projectRoot}${path.sep}`) && fs.statSync(outputPath).isFile();
    } catch {
      return false;
    }
  });
}

export function hyperframesOverlayReceiptsByMediaPath(projectId: string): Map<string, HyperframesOverlayReceipt> {
  const prefix = "media/";
  return new Map(listHyperframesOverlayReceipts(projectId).flatMap((receipt) => {
    const normalized = receipt.output.project_relative_path.replaceAll(path.sep, "/");
    return normalized.startsWith(prefix) ? [[normalized.slice(prefix.length), receipt] as const] : [];
  }));
}

export function listHyperframesCompositions(projectId: string): HyperframesCompositionSummary[] {
  const projectRoot = projectDir(projectId);
  const sourceRoot = path.join(projectRoot, "hyperframes");
  const receiptById = new Map(readValidReceipts(projectId).map((receipt) => [receipt.composition_id, receipt]));
  const compositionIds = new Set(receiptById.keys());
  try {
    for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && isSafeHyperframesCompositionId(entry.name)) compositionIds.add(entry.name);
    }
  } catch {
    // A project with no HyperFrames directory has no draft compositions.
  }

  return [...compositionIds].sort().map((compositionId) => {
    const sourceDirectory = path.join(sourceRoot, compositionId);
    const receipt = receiptById.get(compositionId) ?? null;
    let sourceFingerprint: string | null = null;
    let sourceExists = false;
    try {
      sourceExists = fs.statSync(sourceDirectory).isDirectory();
      if (sourceExists) sourceFingerprint = fingerprintHyperframesSource(sourceDirectory);
    } catch {
      sourceExists = false;
    }

    let outputExists = false;
    if (receipt) {
      try {
        outputExists = fs.statSync(path.join(projectRoot, receipt.output.project_relative_path)).isFile();
      } catch {
        outputExists = false;
      }
    }

    const state: HyperframesCompositionState = !sourceExists
      ? "source_missing"
      : !receipt
        ? "draft"
        : !outputExists
          ? "render_missing"
          : sourceFingerprint === receipt.source.fingerprint_sha256
            ? "current"
            : "source_changed";

    return {
      composition_id: compositionId,
      source_directory: `hyperframes/${compositionId}`,
      source_fingerprint_sha256: sourceFingerprint,
      rendered_source_fingerprint_sha256: receipt?.source.fingerprint_sha256 ?? null,
      state,
      output_path: outputExists ? receipt?.output.project_relative_path ?? null : null,
      output_sha256: outputExists ? receipt?.output.sha256 ?? null : null,
      duration_seconds: outputExists ? receipt?.output.duration_seconds ?? null : null,
      rendered_at: outputExists ? receipt?.render.rendered_at ?? null : null,
    };
  });
}
