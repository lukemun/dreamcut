import fs from "node:fs";
import path from "node:path";

import { readJsonFile } from "./atomic-json";
import { MANIFEST_FILE_NAME, parseCompositionManifest } from "@/lib/hyperframes/composition-manifest";
import type { ProposalMotionItem } from "@/lib/agent/proposal-review";

import { listCandidateRenders, motionSubjectForMedia } from "./hyperframes-candidates";
import { fingerprintHyperframesSource } from "./hyperframes-overlays";
import { appendMotionAuditEvent, type MotionAuditSubjectKind } from "./motion-audit";
import { projectDir } from "./paths";
import { projectSoundReceiptPath, type SynthSoundReceipt } from "./synth-sounds";

/**
 * When a proposal that places a model-authored composition or synthesized sound is
 * approved or rejected, record the creator's decision (and optional 1–5 rating) and the
 * placement in that item's audit trail. Audit failures never block the review itself.
 */

type ProposalOperationLike = {
  element_id: string;
  create_visual?: { source_url?: string; timeline_start?: number; source_start_seconds?: number; source_end_seconds?: number; playback_rate?: number };
  create_audio?: { source_url?: string; timeline_start?: number; source_start_seconds?: number; source_end_seconds?: number; playback_rate?: number };
};

export type MotionPlacement = {
  kind: MotionAuditSubjectKind;
  id: string;
  element_id: string;
  source_url: string;
  timeline_start: number | null;
  duration: number | null;
};

/** Model-authored items a proposal option places, in operation order. */
export function motionPlacementsInOption(projectId: string, operations: ProposalOperationLike[]): MotionPlacement[] {
  return operations.flatMap((operation) => {
    const create = operation.create_visual ?? operation.create_audio;
    if (!create?.source_url) return [];
    const subject = motionSubjectForMedia(projectId, create.source_url);
    if (!subject) return [];
    const window = typeof create.source_start_seconds === "number" && typeof create.source_end_seconds === "number"
      ? (create.source_end_seconds - create.source_start_seconds) / (create.playback_rate ?? 1)
      : null;
    return [{
      ...subject,
      element_id: operation.element_id,
      source_url: create.source_url,
      timeline_start: typeof create.timeline_start === "number" ? create.timeline_start : null,
      duration: window,
    }];
  });
}

function mediaRelative(projectId: string, sourceUrl: string): string {
  const prefix = `/api/projects/${projectId}/media/`;
  return `media/${decodeURIComponent(sourceUrl.slice(prefix.length))}`;
}

/** Source fingerprint of the exact render a placement uses, falling back to the current source. */
function placementFingerprint(projectId: string, placement: MotionPlacement): string | null {
  const output = mediaRelative(projectId, placement.source_url);
  if (placement.kind === "composition") {
    const render = listCandidateRenders(projectId, placement.id).find((receipt) => receipt.output.project_relative_path === output);
    if (render) return render.source.fingerprint_sha256;
    const directory = path.join(projectDir(projectId), "hyperframes", placement.id);
    return fs.existsSync(directory) ? fingerprintHyperframesSource(directory) : null;
  }
  const receipt = readJsonFile<SynthSoundReceipt | null>(projectSoundReceiptPath(projectId, placement.id), null);
  if (receipt?.output.project_relative_path === output) return receipt.source.fingerprint_sha256;
  const directory = path.join(projectDir(projectId), "sounds", placement.id);
  return fs.existsSync(directory) ? fingerprintHyperframesSource(directory) : null;
}

export function parseMotionRating(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 5) {
    throw Object.assign(new Error("rating must be a whole number from 1 to 5"), { status: 400 });
  }
  return value as number;
}

export function recordMotionProposalReview(
  projectId: string,
  proposalId: string,
  operations: ProposalOperationLike[],
  decision: "approved" | "rejected",
  rating: number | null,
): number {
  let recorded = 0;
  const seen = new Set<string>();
  for (const placement of motionPlacementsInOption(projectId, operations)) {
    try {
      const fingerprint = placementFingerprint(projectId, placement);
      if (!fingerprint) continue;
      const subject = { kind: placement.kind, id: placement.id };
      const person = { type: "person" as const, via: "editor" as const };
      const key = `${placement.kind}:${placement.id}`;
      // One review per item even when the option places it more than once; the rating applies to the item.
      if (!seen.has(key)) {
        seen.add(key);
        appendMotionAuditEvent(projectId, subject, person, {
          type: "review", source_fingerprint_sha256: fingerprint, decision, rating, proposal_id: proposalId,
        });
        recorded += 1;
      }
      if (decision === "approved") {
        appendMotionAuditEvent(projectId, subject, person, {
          type: "placement", element_id: placement.element_id, source_fingerprint_sha256: fingerprint,
          timeline_start: placement.timeline_start, duration: placement.duration,
        });
      }
    } catch (error) {
      console.warn(`[motion-audit] could not record ${decision} for ${placement.kind} ${placement.id}:`, error);
    }
  }
  return recorded;
}

/**
 * Add each proposed composition's controls and the values of the exact render it uses,
 * so the review card can offer them. Items whose render or manifest cannot be read keep
 * no controls; the clip remains reviewable as an ordinary box.
 */
export function withMotionControls(projectId: string, items: ProposalMotionItem[] | undefined): ProposalMotionItem[] | undefined {
  if (!items?.length) return items;
  return items.map((item) => {
    if (item.kind !== "composition") return item;
    try {
      const output = mediaRelative(projectId, item.source_url);
      const render = listCandidateRenders(projectId, item.id).find((receipt) => receipt.output.project_relative_path === output);
      if (!render?.parameters) return item;
      const directory = path.join(projectDir(projectId), "hyperframes", item.id);
      if (!fs.existsSync(directory) || fingerprintHyperframesSource(directory) !== render.source.fingerprint_sha256) return item;
      const manifest = parseCompositionManifest(JSON.parse(fs.readFileSync(path.join(directory, MANIFEST_FILE_NAME), "utf8")));
      if (manifest.controls.length === 0) return item;
      const prefix = `/api/projects/${projectId}/media/`;
      // Every render of this exact source, so a reloaded review shows the values of the chosen render.
      const renders = listCandidateRenders(projectId, item.id)
        .filter((receipt) => receipt.source.fingerprint_sha256 === render.source.fingerprint_sha256 && receipt.parameters)
        .slice(0, 50)
        .map((receipt) => ({
          source_url: prefix + receipt.output.project_relative_path.replace(/^media\//, "").split("/").map(encodeURIComponent).join("/"),
          values: receipt.parameters!.values,
        }));
      // The replaced render may come from an older source; only its values matter here.
      const replacedOutput = item.replaces_source_url ? mediaRelative(projectId, item.replaces_source_url) : null;
      const replaced = replacedOutput ? listCandidateRenders(projectId, item.id).find((receipt) => receipt.output.project_relative_path === replacedOutput)?.parameters?.values : undefined;
      return {
        ...item,
        ...(replaced ? { replaced_values: replaced } : {}),
        controls: manifest.controls,
        values: render.parameters.values,
        source_fingerprint_sha256: render.source.fingerprint_sha256,
        renders,
      };
    } catch {
      return item;
    }
  });
}
