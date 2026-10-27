import fs from "node:fs";
import path from "node:path";

import { motionSubjectFromSourceUrl } from "@/lib/hyperframes/motion-media";

import { readJsonFile } from "./atomic-json";
import { listCandidateRenders } from "./hyperframes-candidates";
import { fingerprintHyperframesSource } from "./hyperframes-overlays";
import { isSafeMotionSubjectId } from "./motion-audit";
import { projectDir } from "./paths";

/**
 * Code-synthesized sounds: source under `sounds/<id>/`, rendered WAV under
 * `media/sounds/<id>/`, receipt under `preprocess/sounds/<id>.json`.
 */

const SHA256_RE = /^[a-f0-9]{64}$/;

export type SynthSoundReceipt = {
  schema_version: 1;
  sound_id: string;
  source: { project_relative_directory: string; fingerprint_sha256: string };
  parameters: {
    manifest_sha256: string | null;
    values_sha256: string;
    values: Record<string, string | number | boolean>;
    seed: number;
  };
  output: {
    project_relative_path: string;
    sha256: string;
    duration_seconds: number;
    sample_rate: number;
    channels: number;
    peak: number;
  };
  render: { renderer: string; rendered_at: string };
};

export function projectSoundsDir(projectId: string): string {
  return path.join(projectDir(projectId), "sounds");
}

export function projectSoundSourceDir(projectId: string, soundId: string): string {
  if (!isSafeMotionSubjectId(soundId)) throw new Error(`Invalid sound id: ${soundId}`);
  return path.join(projectSoundsDir(projectId), soundId);
}

export function projectSoundReceiptPath(projectId: string, soundId: string): string {
  if (!isSafeMotionSubjectId(soundId)) throw new Error(`Invalid sound id: ${soundId}`);
  return path.join(projectDir(projectId), "preprocess", "sounds", `${soundId}.json`);
}

export function validateSynthSoundReceipt(value: unknown): asserts value is SynthSoundReceipt {
  const receipt = value as SynthSoundReceipt;
  if (!receipt || receipt.schema_version !== 1 || !isSafeMotionSubjectId(receipt.sound_id)) {
    throw new Error("Invalid synthesized sound receipt");
  }
  if (receipt.source?.project_relative_directory !== `sounds/${receipt.sound_id}`
    || !SHA256_RE.test(receipt.source.fingerprint_sha256)) {
    throw new Error("Invalid synthesized sound source identity");
  }
  const parameters = receipt.parameters;
  if (!parameters || !(parameters.manifest_sha256 === null || SHA256_RE.test(parameters.manifest_sha256))
    || !SHA256_RE.test(parameters.values_sha256) || !Number.isInteger(parameters.seed)
    || !parameters.values || typeof parameters.values !== "object" || Array.isArray(parameters.values)) {
    throw new Error("Invalid synthesized sound parameters");
  }
  const output = receipt.output;
  if (!output || !output.project_relative_path.startsWith(`media/sounds/${receipt.sound_id}/`)
    || output.project_relative_path.includes("..") || !SHA256_RE.test(output.sha256)
    || !(output.duration_seconds > 0) || !Number.isInteger(output.sample_rate)
    || (output.channels !== 1 && output.channels !== 2) || !(output.peak >= 0 && output.peak <= 1)) {
    throw new Error("Invalid synthesized sound output");
  }
  if (!receipt.render?.renderer || Number.isNaN(Date.parse(receipt.render.rendered_at))) {
    throw new Error("Invalid synthesized sound render receipt");
  }
}

export type SynthSoundSummary = {
  sound_id: string;
  source_directory: string;
  state: "draft" | "current" | "source_changed" | "render_missing" | "source_missing";
  output_path: string | null;
  duration_seconds: number | null;
};

export function listSynthSounds(projectId: string): SynthSoundSummary[] {
  const ids = new Set<string>();
  try {
    for (const entry of fs.readdirSync(projectSoundsDir(projectId), { withFileTypes: true })) {
      if (entry.isDirectory() && isSafeMotionSubjectId(entry.name)) ids.add(entry.name);
    }
  } catch {
    // No sounds directory means no synthesized sounds.
  }
  const receiptsDir = path.join(projectDir(projectId), "preprocess", "sounds");
  const receipts = new Map<string, SynthSoundReceipt>();
  try {
    for (const name of fs.readdirSync(receiptsDir)) {
      if (!name.endsWith(".json")) continue;
      const receipt = readJsonFile<unknown>(path.join(receiptsDir, name), null);
      try {
        validateSynthSoundReceipt(receipt);
        receipts.set(receipt.sound_id, receipt);
        ids.add(receipt.sound_id);
      } catch {
        // Invalid receipts never become project state.
      }
    }
  } catch {
    // No receipts yet.
  }
  const root = projectDir(projectId);
  return [...ids].sort().map((soundId) => {
    const source = path.join(projectSoundsDir(projectId), soundId);
    const receipt = receipts.get(soundId) ?? null;
    const sourceExists = fs.existsSync(source);
    const outputExists = receipt ? fs.existsSync(path.join(root, receipt.output.project_relative_path)) : false;
    const state: SynthSoundSummary["state"] = !sourceExists
      ? "source_missing"
      : !receipt
        ? "draft"
        : !outputExists
          ? "render_missing"
          : fingerprintHyperframesSource(source) === receipt.source.fingerprint_sha256
            ? "current"
            : "source_changed";
    return {
      sound_id: soundId,
      source_directory: `sounds/${soundId}`,
      state,
      output_path: outputExists ? receipt!.output.project_relative_path : null,
      duration_seconds: outputExists ? receipt!.output.duration_seconds : null,
    };
  });
}

/** `media/...` inside this project for one of its own media URLs; another project's URL is null even when
 * this project has a file at the same relative path. */
function projectMediaRelativePath(projectId: string, sourceUrl: string): string | null {
  const prefix = `/api/projects/${encodeURIComponent(projectId)}/media/`;
  if (!sourceUrl.startsWith(prefix)) return null;
  try { return `media/${decodeURIComponent(sourceUrl.slice(prefix.length))}`; } catch { return null; }
}

/** Length of a synthesized sound render in this project, or null when the URL is not its latest render. */
export function synthSoundDurationForSource(projectId: string, sourceUrl: string): number | null {
  const subject = motionSubjectFromSourceUrl(sourceUrl);
  if (subject?.kind !== "sound") return null;
  const receipt = readJsonFile<unknown>(projectSoundReceiptPath(projectId, subject.id), null);
  try { validateSynthSoundReceipt(receipt); } catch { return null; }
  const relative = projectMediaRelativePath(projectId, sourceUrl);
  if (!relative || receipt.output.project_relative_path !== relative) return null;
  return fs.existsSync(path.join(projectDir(projectId), relative)) ? receipt.output.duration_seconds : null;
}

/** Whether a URL is a recorded, present render of the composition it names in this project. */
export function isRecordedMotionRender(projectId: string, sourceUrl: string): boolean {
  const subject = motionSubjectFromSourceUrl(sourceUrl);
  if (subject?.kind !== "composition") return false;
  const relative = projectMediaRelativePath(projectId, sourceUrl);
  return !!relative && listCandidateRenders(projectId, subject.id).some(render => render.output.project_relative_path === relative)
    && fs.existsSync(path.join(projectDir(projectId), relative));
}
