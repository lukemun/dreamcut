import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { resolveProposalPreviewHiddenLanes, resolveProposalPreviewLaneOrder, resolveProposalPreviewMutedLanes } from "@/components/studio/timeline/proposal-preview-visibility";
import { applyProposalReviewOverrides, proposalNumericOverridesSchema } from "@/lib/agent/proposal-overrides";
import { resolveProposalBatch } from "@/lib/agent/proposal-batch";
import { reviewOption } from "@/lib/agent/proposal-review";
import { previewEditorAgentProposal, previewEditorAgentProposalBatch, proposalOption, timelineRevision } from "@/lib/agent/timeline-editor-agent-apply";
import { buildCompositionElements, getCompositionDimensions } from "@/lib/render/composition-adapters";
import { preparedWorker } from "@/lib/render/prepared-client";
import { proposalPlaybackLeadInSeconds, resolveProposalPlaybackRange } from "@/lib/timeline/audition-playback";
import { preparedPictureInput, type PreparedPreviewStatus } from "@/lib/timeline/prepared-preview";
import { buildTimelineTransitionLayout } from "@/lib/timeline/transitions";
import type { ProposalNumericOverride } from "@/lib/agent/proposal-overrides";

import { writeJsonFileAtomic } from "./atomic-json";
import { projectDir } from "./paths";
import { readProposal } from "./proposals";
import { readProposalTuning } from "./proposal-tuning";
import { readMetadata, readTimeline } from "./store";
import { timelinePayload } from "./timeline-payload";

/**
 * A proposal's preview, flattened ahead of time. When a card is created (or first previewed), the
 * draft is derived exactly as approval would derive it and the stretch its preview plays is rendered
 * to one video by the prepared-preview worker. Previewing that option with the same tuning on the
 * same timeline revision then plays that video for that stretch instead of decoding every layer.
 * Keyed by the selected options, their tuning and the timeline revision; anything else is a miss.
 */
export type ReadyPreviewItem = { proposalId: string; optionId?: string; overrides?: readonly ProposalNumericOverride[] };
export type ReadyPreview = { state: PreparedPreviewStatus["state"] | "none"; progress: number; url?: string; range?: [number, number]; error?: string };

const PREVIEW_FPS = 30;
const READY_OWNER = "proposal-ready-preview";
const MAX_FRAMES = 1800;
const TRAILING_SECONDS = 0.5;

type Record_ = { key: string; id: string; range: [number, number]; created_at: string };
const recordPath = (projectId: string, key: string) => path.join(projectDir(projectId), "preprocess", "proposal-ready-previews", `${key}.json`);

/** The cache key: which options in review order, with which tuning, on which timeline revision and lane
 * settings (lane order, muted and hidden lanes live in metadata, not the timeline), and the picture they
 * derive to: anything derived from more than the card (placed labels resolved against their anchors'
 * measured boxes) re-renders when the derivation changes, instead of replaying an old flattening. */
function readyKey(projectId: string, items: ReadonlyArray<{ proposalId: string; optionId: string; overrides: readonly ProposalNumericOverride[] }>, input: unknown): string {
  const parts = items.map((item) => ({ p: item.proposalId, o: item.optionId, t: item.overrides ?? [] }));
  const metadata = readMetadata(projectId);
  const lanes = { order: metadata.lane_order_keys ?? [], muted: metadata.muted_lane_keys ?? [], hidden: metadata.hidden_lane_keys ?? [] };
  const picture = createHash("sha256").update(JSON.stringify(input ?? null)).digest("hex");
  return createHash("sha256").update(JSON.stringify({ revision: timelineRevision(projectId), lanes, parts, picture })).digest("hex").slice(0, 32);
}

/** Each item with its option and effective tuning resolved (saved tuning when none is given). */
function resolveItems(projectId: string, items: readonly ReadyPreviewItem[]) {
  return items.map((item) => {
    const record = readProposal(projectId, item.proposalId);
    const optionId = proposalOption(record.proposal, item.optionId).id;
    const overrides = proposalNumericOverridesSchema.parse(item.overrides ?? readProposalTuning(projectId, item.proposalId)[optionId] ?? []);
    return { record, proposalId: item.proposalId, optionId, overrides };
  });
}

/** The prepared-preview input for the stretch this selection's preview plays, built as the player builds its draft. */
function readyInput(projectId: string, resolved: ReturnType<typeof resolveItems>) {
  const live = readTimeline(projectId);
  const metadata = readMetadata(projectId);
  let timeline, touched: string[], laneOrderKeys: string[] | undefined, mutedLaneKeys: string[] | undefined, outputFormat, review;
  if (resolved.length === 1) {
    const [item] = resolved;
    const proposal = applyProposalReviewOverrides(item!.record.proposal, item!.optionId, item!.overrides, live);
    if (proposal.decision !== "propose") return null;
    const preview = previewEditorAgentProposal(proposal, item!.optionId);
    if (preview.stale) return null;
    ({ timeline, touched, laneOrderKeys, mutedLaneKeys, outputFormat } = preview);
    review = reviewOption(live, preview.option);
  } else {
    // As the batch preview route composes it, including the shared playback window.
    const batch = resolveProposalBatch(projectId, resolved.map((item) => ({ proposal_id: item.proposalId, option_id: item.optionId, overrides: item.overrides })));
    const preview = previewEditorAgentProposalBatch(projectId, batch.items.map((item) => item.option));
    ({ timeline, touched, laneOrderKeys, mutedLaneKeys, outputFormat } = preview);
    const contextRanges = batch.items.some((item) => item.option.preview_range) ? batch.items.flatMap((item) => {
      const itemReview = reviewOption(live, item.option);
      const range = resolveProposalPlaybackRange(item.option.operations.map((op) => op.element_id), preview.timeline.elements, live.elements, itemReview);
      return range ? [{ start_seconds: Math.max(0, range.startSeconds - proposalPlaybackLeadInSeconds(itemReview)), end_seconds: range.endSeconds }] : [];
    }) : [];
    review = {
      ...(contextRanges.length ? { preview_range: { start_seconds: Math.min(...contextRanges.map((range) => range.start_seconds)), end_seconds: Math.max(...contextRanges.map((range) => range.end_seconds)) } } : {}),
      rows: batch.items.flatMap((item) => reviewOption(live, item.option).rows),
    };
  }
  const payload = timelinePayload(projectId, timeline, laneOrderKeys, outputFormat, mutedLaneKeys);
  if (payload.frame_rate !== PREVIEW_FPS) return null;
  const draft = payload.elements;
  const liveMuted = new Set(metadata.muted_lane_keys), liveHidden = new Set(metadata.hidden_lane_keys ?? []);
  const muted = resolveProposalPreviewMutedLanes({ liveMutedLanes: liveMuted, previewMutedLaneKeys: payload.muted_lane_keys ?? [...liveMuted], previewElements: draft, touchedElementIds: touched });
  const hidden = resolveProposalPreviewHiddenLanes({ liveHiddenLanes: liveHidden, previewHiddenLaneKeys: payload.hidden_lane_keys ?? [...liveHidden], previewElements: draft, touchedElementIds: touched });
  const lanes = resolveProposalPreviewLaneOrder({ liveHiddenLanes: liveHidden, previewLaneOrderKeys: payload.lane_order_keys ?? [], previewElements: draft, touchedElementIds: touched });
  const layout = buildTimelineTransitionLayout(draft, payload.transitions ?? []);
  const durationInFrames = Math.ceil(Math.max(1, layout.effectiveDurationSeconds) * PREVIEW_FPS);
  if (durationInFrames > MAX_FRAMES) return null;
  const range = resolveProposalPlaybackRange(touched, draft, live.elements, review);
  if (!range) return null;
  const start = Math.max(0, range.startSeconds - proposalPlaybackLeadInSeconds(review));
  const end = Math.max(range.endSeconds, start + 0.8) + TRAILING_SECONDS;
  const frameRange: [number, number] = [Math.max(0, Math.floor(start * PREVIEW_FPS) - 2), Math.min(durationInFrames - 1, Math.ceil(end * PREVIEW_FPS) + 1)];
  if (frameRange[1] <= frameRange[0]) return null;
  const { width, height } = getCompositionDimensions(payload.aspect_ratio);
  const elements = buildCompositionElements(layout.renderedElements, muted, hidden);
  if (elements.length > 256) return null;
  return preparedPictureInput({ backend: "standard", width, height, fps: PREVIEW_FPS, durationInFrames, frameRange, inputProps: { elements, laneOrderKeys: lanes } });
}

/**
 * The flattened preview for a selection of options: its state, and once ready its video and the frame
 * range it covers. With `start`, a missing preview is begun (`origin` is the editor the worker renders
 * through); otherwise a missing one reports `none`.
 */
export async function proposalReadyPreview(projectId: string, items: readonly ReadyPreviewItem[], options: { start?: boolean; origin?: string } = {}): Promise<ReadyPreview> {
  if (items.length === 0) return { state: "none", progress: 0 };
  const resolved = resolveItems(projectId, items);
  const input = readyInput(projectId, resolved);
  const key = readyKey(projectId, resolved, input);
  const file = recordPath(projectId, key);
  let record: Record_ | null = null;
  try { record = JSON.parse(fs.readFileSync(file, "utf8")) as Record_; } catch { /* not prepared yet */ }
  if (record) {
    try {
      const status = await preparedWorker.status(projectId, record.id);
      if (status.state !== "failed" && status.state !== "cancelled" && status.state !== "stale") {
        return { state: status.state, progress: status.progress, url: status.url, range: record.range };
      }
    } catch { /* the job is gone; prepare it again */ }
  }
  const pendingKey = `${projectId}:${key}`;
  if (starting.has(pendingKey)) return { state: "queued", progress: 0 };
  if (!options.start || !options.origin) return { state: "none", progress: 0 };
  if (!input?.frameRange) return { state: "none", progress: 0 };
  // Starting can build the renderer first; callers poll rather than wait for it.
  const origin = options.origin, range = input.frameRange;
  // One flattened preview per project at a time: a newer selection replaces the one still rendering,
  // so previews never queue up behind each other or starve the editor's own playback.
  starting.set(pendingKey, preparedWorker.start(projectId, READY_OWNER, input, origin, Date.now()).then((status) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeJsonFileAtomic(file, { key, id: status.id, range, created_at: new Date().toISOString() } satisfies Record_);
  }).catch((error) => {
    console.warn(`Proposal preview was not prepared ahead: ${error instanceof Error ? error.message : String(error)}`);
  }).finally(() => starting.delete(pendingKey)));
  return { state: "queued", progress: 0, range };
}

const starting = new Map<string, Promise<void>>();
