"use client";

import type { ProposalControlReference } from "@/lib/agent/proposal-controls";
import { unpackInboxControlSets } from "@/lib/agent/inbox-control-sets";
import { fetchConditionalJson, type ConditionalResult } from "./shared-poll";
import { historyReplayRequestInit } from "./history-replay-request";
import { fetchPreviewJson } from "./preview-request-timing";

import type { BeatMarker, LaneDefaultsMap, TimelineAspectRatio, TimelineElement, TimelineTransition } from "./types";
import type { AudioEffectAction } from "@/lib/timeline/audio-effects";
import type {
  VideoStabilizationAction,
  VideoStabilizationMode,
} from "@/lib/timeline/video-stabilization";

type JsonObject = Record<string, unknown>;

// Writes made while an Undo/Redo step replays carry its label into saved history.
const fetch: typeof globalThis.fetch = (input, init) => globalThis.fetch(input, historyReplayRequestInit(init));

export type TimelineResponse = {
  elements?: TimelineElement[];
  transitions?: TimelineTransition[];
  beats?: BeatMarker[];
  lane_defaults?: LaneDefaultsMap;
  lane_order_keys?: string[];
  muted_lane_keys?: string[];
  hidden_lane_keys?: string[];
  aspect_ratio?: string;
  frame_rate?: number;
  delivery_target?: string;
  caption_safe_area_mode?: "organic" | "paid_ad";
};

export type CharactersResponse = {
  characters?: Array<{ id?: string; name?: string }>;
};

// ── Agent proposal shapes (server derives review rows; the agent only authors rationale) ──

export type ProposalFieldChange = {
  field: string;
  label: string;
  before: string;
  after: string;
  target: "create_audio" | "create_visual" | "create_text" | "create_shape" | "create_transition" | "remove_visual" | "set_lane_order" | "set_output_format" | "opening_sequence_edit" | "source_range_cut" | "speed_change" | "use_video_stabilization" | "use_recast" | "use_voice_enhancement" | "reattach_original_audio" | "sync_speech_visual" | "replace_captions" | "patch" | "props" | "clear_patch" | "clear_props" | "timing_control" | "block";
  operation_index: number;
  after_value?: unknown;
  control_range?: { min: number; max: number };
  control_unit?: "seconds" | "frames";
  control_group?: { operation_index: number; offset_seconds: number };
  implicit_default?: boolean;
  block_id?: string;
  control_display?: { step: number; suffix: string };
  control_tier?: "main" | "advanced";
  /** Section heading this dial sits under (one per beat, in time order); a review control's `section` is the agent-authored route to the same heading. */
  section?: string;
  control_choices?: { value: string; label: string }[];
};

export type ProposalNumericOverride = {
  operation_index: number;
  target: "create_audio" | "create_visual" | "create_text" | "create_shape" | "create_transition" | "opening_sequence_edit" | "replace_captions" | "source_range_cut" | "speed_change" | "patch" | "props" | "timing_control" | "block";
  field: string;
  /** A list tunes a graph or wheel dial as one value. */
  value: number | string | number[];
};

export type ProposalBatchSelection = {
  proposal_id: string;
  option_id: string;
  overrides?: ProposalNumericOverride[];
};

export type ProposalReviewRow = {
  element_id: string;
  element_label: string;
  element_type: string;
  action: string;
  changes: ProposalFieldChange[];
  rationale?: string;
};

export type ProposalMotionControl = (
  | { id: string; kind: "text"; label: string; default: string; max_length?: number }
  | { id: string; kind: "color"; label: string; default: string }
  | { id: string; kind: "number"; label: string; default: number; min: number; max: number; step?: number; unit?: string }
  | { id: string; kind: "choice"; label: string; default: string; options: Array<{ value: string; label: string; label_from?: string }> }
  | { id: string; kind: "switch"; label: string; default: boolean }
  /** Set where the graphic is placed; renders with its value but is never shown as a dial. */
) & { fixed?: true; resets_with?: string };

export type ProposalMotionItem = {
  kind: "composition" | "sound";
  id: string;
  operation_index: number;
  /** A new graphic (create_visual) or an existing clip whose picture is swapped (patch). */
  target?: "create_visual" | "patch";
  source_url: string;
  controls?: ProposalMotionControl[];
  values?: Record<string, string | number | boolean>;
  /** Values of the render this one replaces; settings that differ are the card's main dials. */
  replaced_values?: Record<string, string | number | boolean>;
  source_fingerprint_sha256?: string;
  renders?: Array<{ source_url: string; values: Record<string, string | number | boolean> }>;
};

export type MotionRenderStatus =
  | { state: "rendering" | "preparing_preview"; composition_id: string; job_key?: string }
  | { state: "ready"; composition_id: string; job_key?: string; source_url: string; duration_seconds: number }
  | { state: "failed"; composition_id: string; job_key?: string; error: string | null };

export type ProposalOptionReview = {
  adjustment_rows?: ProposalReviewRow[];
  review_controls?: ProposalControlReference[];
  preview_range?: { start_seconds: number; end_seconds: number };
  playback_range?: { start_seconds: number; end_seconds: number };
  option_id: string;
  label: string;
  recommended: boolean;
  summary: string;
  requested_mutations: number;
  impact: string;
  rows: ProposalReviewRow[];
  /** Model-authored motion graphics and synthesized sounds this option places. */
  motion_items?: ProposalMotionItem[];
  /** The agent's main dials for the graphics this option places; the rest sit in Advanced. */
  motion_main_controls?: string[];
  /** For cuts in speech: the words around each cut and the words it removes (empty for a pause). */
  speech_edits?: Array<{ before: string; removed: string; after: string; seconds: number }>;
};

export type ProposalListEntry = {
  rebase_policy?: "strict" | "independent";
  replaced_by_pending_proposal_id?: string | null;
  replaced_by_approved_proposal_id?: string | null;
  previous_drafts?: { proposal_id: string; summary: string }[];
  proposal_id: string;
  created_at: string;
  status: "pending" | "approved" | "rejected";
  brief: string | null;
  summary: string;
  mode: string;
  decision: string;
  option_count: number;
  /** Set when this proposal is one step of a larger edit sent as a queue. */
  wave?: import("./proposal-inbox").ProposalWaveInfo | null;
  stale: boolean;
  /** Why it went stale, when it did — shown in the review drawer. */
  stale_reason?: string | null;
  /** Settings this card will replace that the creator changed since it was drafted. */
  overrides?: { element_id: string; field: string }[];
  /** The creator's latest Repair request for this card, while it still needs repair. */
  agent_request?: ProposalAgentRequest | null;
};

/** A Repair or Draft request sent from the review panel; `prompt` is the message the agent receives. */
export type ProposalAgentRequest = { kind: "repair" | "draft"; target_id: string; requested_at: string; prompt: string };

export type ProposalListResponse = {
  revision: string;
  proposals: ProposalListEntry[];
};

export type ProposalInboxDetail = Pick<ProposalDetailResponse, "status" | "stale" | "stale_reason" | "review" | "tuning">;
/** A recorded request the agent has not drafted, linked or set aside yet. Informational only. */
/** `media`: for a brief started from Home, what it brought into the Library. */
export type PendingRequest = { id: string; direction: string; time: string; agent_request?: ProposalAgentRequest | null; media?: string[] };
export type ProposalInboxResponse = ProposalListResponse & {
  details: Record<string, ProposalInboxDetail | { error: string }>;
  pending_requests?: PendingRequest[];
};

export type ProposalDetailResponse = {
  tuning?: Record<string, ProposalNumericOverride[]>;
  proposal_id: string;
  created_at: string;
  status: "pending" | "approved" | "rejected";
  brief?: string;
  stale: boolean;
  stale_reason?: string | null;
  proposal: { summary: string; mode: string; decision: string };
  review: ProposalOptionReview[];
};

export type ProposalPreviewResponse = {
  /** Absent from the editor's batch preview, which asks the server to skip it. */
  spatial_assessment?: import("@/lib/media-analysis/spatial-assessment").SpatialAssessment;
  proposal_id: string;
  option_id: string;
  stale: boolean;
  touched_element_ids: string[];
  review: ProposalOptionReview;
  timeline: TimelineResponse;
};

type DuplicateElementResponse = {
  element?: TimelineElement;
  error?: string;
};

type CaptionFollowResponse = {
  caption_follow_elements?: TimelineElement[];
  history?: { before: { id: string }; after: { id: string } };
};

type SplitElementResponse = CaptionFollowResponse & {
  updated?: TimelineElement;
  inserted?: TimelineElement;
  transitions?: TimelineTransition[];
  error?: string;
};

type PatchElementResponse = CaptionFollowResponse & {
  element?: TimelineElement;
  transitions?: TimelineTransition[];
  error?: string;
};

type PatchElementsResponse = CaptionFollowResponse & {
  elements?: Array<TimelineElement | undefined>;
  transitions?: TimelineTransition[];
  error?: string;
};

type DeleteElementResponse = CaptionFollowResponse & {
  ok?: boolean;
  transitions?: TimelineTransition[];
  error?: string;
};

type RestoreElementResponse = CaptionFollowResponse & {
  element?: TimelineElement;
  transitions?: TimelineTransition[];
  error?: string;
};

type CreateElementResponse = {
  element?: TimelineElement;
  error?: string;
};

type LaneOrderResponse = {
  lane_order_keys?: string[];
  error?: string;
};

export type MutationHistoryDescriptors = {
  before: { id: string; op: string; at: string };
  after: { id: string; op: string; at: string };
};

type MutedLaneResponse = {
  muted_lane_keys?: string[];
  hidden_lane_keys?: string[];
  history?: MutationHistoryDescriptors | null;
  error?: string;
};

type LaneDefaultsResponse = {
  lane_defaults?: LaneDefaultsMap;
  updated_count?: number;
  error?: string;
};

type TransitionResponse = {
  transition?: TimelineTransition;
  error?: string;
};

type OutputFormatResponse = {
  aspect_ratio?: string;
  frame_rate?: number;
  delivery_target?: string;
  caption_safe_area_mode?: "organic" | "paid_ad";
  history?: MutationHistoryDescriptors | null;
  error?: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await readJsonSafe<JsonObject>(response, {});
  assertOk(response, body, `Request failed (${response.status})`);
  return body as T;
}

async function readJsonSafe<T>(response: Response, fallback: T): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    return fallback;
  }
}

function assertOk(response: Response, body: JsonObject, fallbackMessage: string) {
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : fallbackMessage);
  }
}

export type TimelineClient = ReturnType<typeof createTimelineClient>;

export function createTimelineClient(projectId: string) {
  // The last timeline body and its tag: an unchanged reload answers 304 and is parsed again from this
  // text, so every caller still gets its own fresh objects.
  let lastTimeline: { etag: string; text: string } | null = null;
  return {
    projectId,
    async getTimeline() {
      const response = await fetch(`/api/projects/${projectId}/timeline`, {
        cache: "no-store",
        headers: lastTimeline ? { "If-None-Match": lastTimeline.etag } : undefined,
      });
      if (response.status === 304 && lastTimeline) return JSON.parse(lastTimeline.text) as TimelineResponse;
      const text = await response.text();
      let body: JsonObject = {};
      try { body = JSON.parse(text) as JsonObject; } catch { /* reported below as a failed read */ }
      assertOk(response, body, `Request failed (${response.status})`);
      const etag = response.headers.get("etag");
      lastTimeline = etag ? { etag, text } : null;
      return body as TimelineResponse;
    },

    // ── Agent proposals: list, review detail, pure preview, approve/reject ──
    async listProposals(status?: "pending" | "approved" | "rejected") {
      const query = new URLSearchParams({ _: String(Date.now()) });
      if (status) query.set("status", status);
      const response = await fetch(`/api/projects/${projectId}/timeline/proposals?${query}`, {
        cache: "no-store",
      });
      return readJson<ProposalListResponse>(response);
    },

    /** List plus pending review details in one conditional request (304 when unchanged). */
    async getProposalInbox(etag: string | null): Promise<ConditionalResult<ProposalInboxResponse>> {
      const result = await fetchConditionalJson<ProposalInboxResponse>(`/api/projects/${projectId}/timeline/proposals?include=pending_details`, etag);
      if (!result.notModified) unpackInboxControlSets(result.value);
      return result;
    },

    async saveProposalTuning(proposalId: string, optionId: string, overrides: ProposalNumericOverride[]) {
      return readJson(await fetch(`/api/projects/${projectId}/timeline/proposals/${proposalId}/tuning`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option_id: optionId, overrides }),
      }));
    },
    async getProposal(proposalId: string) {
      const response = await fetch(`/api/projects/${projectId}/timeline/proposals/${proposalId}?_=${Date.now()}`, {
        cache: "no-store",
      });
      return readJson<ProposalDetailResponse>(response);
    },

    /** The timeline AS IT WOULD BE if the option were approved. Writes nothing. */
    async previewProposal(proposalId: string, optionId?: string, overrides?: ProposalNumericOverride[]) {
      const label = `${proposalId}${optionId ? `/${optionId}` : ""}`;
      if (overrides?.length) {
        return fetchPreviewJson(label, `/api/projects/${projectId}/timeline/proposals/${proposalId}/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ option_id: optionId, overrides }),
        }, readJson<ProposalPreviewResponse>, fetch);
      }
      const query = optionId ? `?option=${encodeURIComponent(optionId)}` : "";
      return fetchPreviewJson(label, `/api/projects/${projectId}/timeline/proposals/${proposalId}/preview${query}`, {
        cache: "no-store",
      }, readJson<ProposalPreviewResponse>, fetch);
    },

    async approveProposal(proposalId: string, optionId?: string, overrides?: ProposalNumericOverride[], rating?: number) {
      const response = await fetch(`/api/projects/${projectId}/timeline/proposals/${proposalId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-dreamcut-client": "editor" },
        body: JSON.stringify({ ...(optionId ? { option_id: optionId } : {}), ...(overrides?.length ? { overrides } : {}), ...(rating ? { rating } : {}) }),
      });
      return readJson<{
        applied: true;
        option_id: string;
        after_revision: string;
        superseded_proposal_ids?: string[];
        history?: MutationHistoryDescriptors | null;
      }>(response);
    },

    /** Compose selected proposals on one draft timeline instead of playing them one by one. */
    async previewProposalBatch(selections: ProposalBatchSelection[]) {
      return fetchPreviewJson(`batch of ${selections.length}`, `/api/projects/${projectId}/timeline/proposals/batch/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The player reads only the draft timeline and review; the spatial assessment is for agents.
        body: JSON.stringify({ selections, spatial: false }),
      }, readJson<ProposalPreviewResponse>, fetch);
    },

    /** Apply selected proposals in one timeline write and one Undo snapshot. */
    async approveProposalBatch(selections: ProposalBatchSelection[]) {
      const response = await fetch(`/api/projects/${projectId}/timeline/proposals/batch/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-dreamcut-client": "editor" },
        body: JSON.stringify({ selections }),
      });
      return readJson<{
        applied: true;
        approved_count: number;
        approved_proposal_ids: string[];
        after_revision: string;
        superseded_proposal_ids?: string[];
        history?: MutationHistoryDescriptors | null;
      }>(response);
    },

    /** Controls and values of a motion graphic already on the timeline (Properties). */
    async motionControlsFor(sourceUrl: string) {
      const response = await fetch(`/api/projects/${projectId}/hyperframes/controls?source_url=${encodeURIComponent(sourceUrl)}`, {
        headers: { "x-dreamcut-client": "editor" },
      });
      return readJson<ProposalMotionItem>(response);
    },

    async renderMotionValues(compositionId: string, request: {
      values: Record<string, string | number | boolean>;
      previous_values?: Record<string, string | number | boolean>;
      expected_source_fingerprint?: string;
      proposal_id?: string;
      element_id?: string;
    }) {
      const response = await fetch(`/api/projects/${projectId}/hyperframes/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-dreamcut-client": "editor" },
        body: JSON.stringify({ composition_id: compositionId, actor: "person", ...request }),
      });
      return readJson<MotionRenderStatus>(response);
    },

    async motionRenderStatus(compositionId: string, jobKey?: string) {
      const key = jobKey ? `&job_key=${encodeURIComponent(jobKey)}` : "";
      const response = await fetch(`/api/projects/${projectId}/hyperframes/prepare?composition_id=${encodeURIComponent(compositionId)}${key}`, {
        headers: { "x-dreamcut-client": "editor" },
      });
      return readJson<MotionRenderStatus>(response);
    },

    /** Record a Repair (stale card) or Draft (recorded request) ask; returns the message for the creator's chat. */
    async requestAgentWork(kind: ProposalAgentRequest["kind"], targetId: string) {
      const response = await fetch(`/api/projects/${projectId}/timeline/proposals/agent-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-dreamcut-client": "editor" },
        body: JSON.stringify({ kind, target_id: targetId }),
      });
      return (await readJson<{ request: ProposalAgentRequest }>(response)).request;
    },

    async rejectProposal(proposalId: string, reason?: string, rating?: number) {
      const response = await fetch(`/api/projects/${projectId}/timeline/proposals/${proposalId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-dreamcut-client": "editor" },
        body: JSON.stringify({ ...(reason ? { reason } : {}), ...(rating ? { rating } : {}) }),
      });
      return readJson<{ proposal_id: string; status: "rejected"; history?: MutationHistoryDescriptors | null }>(response);
    },

    async restoreHistorySnapshot(snapshotId: string) {
      const response = await fetch(`/api/projects/${projectId}/timeline/history/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-dreamcut-client": "editor" },
        body: JSON.stringify({ snapshot_id: snapshotId }),
      });
      const body = await readJsonSafe<JsonObject>(response, {});
      if (response.ok && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("timeline-editor:project-restored", { detail: { projectId } }));
      }
      return { response, body };
    },

    async getCharacters() {
      const response = await fetch(`/api/projects/${projectId}/characters`);
      return readJson<CharactersResponse | Array<{ id?: string; name?: string }>>(response);
    },

    async patchElement(elementId: string, patch: Record<string, unknown>) {
      const response = await fetch(`/api/projects/${projectId}/timeline/elements/${elementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await readJsonSafe<PatchElementResponse>(response, {});
      return { response, body };
    },

    async patchElements(patches: Array<{ elementId: string; patch: Record<string, unknown> }>) {
      const response = await fetch(`/api/projects/${projectId}/timeline/elements/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operations: patches.map(({ elementId, patch }) => {
            const { props, ...fields } = patch;
            return {
              element_id: elementId,
              ...(Object.keys(fields).length > 0 ? { patch: fields } : {}),
              ...(props && typeof props === "object" && !Array.isArray(props) ? { props } : {}),
            };
          }),
        }),
      });
      const body = await readJsonSafe<PatchElementsResponse>(response, {});
      return { response, body };
    },

    async restoreElement(elementId: string) {
      const response = await fetch(`/api/projects/${projectId}/timeline/elements/${elementId}/restore`, {
        method: "POST",
      });
      const body = await readJsonSafe<RestoreElementResponse>(response, {});
      return { response, body };
    },

    async normalizeElement(elementId: string) {
      const response = await fetch(`/api/projects/${projectId}/timeline/elements/${elementId}/normalize`, {
        method: "POST",
      });
      const body = await readJsonSafe<PatchElementResponse>(response, {});
      return { response, body };
    },

    async applyAudioEffect(
      elementId: string,
      action: AudioEffectAction,
      options?: { strength?: number },
    ) {
      const response = await fetch(`/api/projects/${projectId}/timeline/elements/${elementId}/audio-effects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...options }),
      });
      const body = await readJsonSafe<{
        elements?: TimelineElement[];
        transitions?: TimelineTransition[];
        error?: string;
      }>(response, {});
      return { response, body };
    },

    async applyVideoStabilization(
      elementId: string,
      action: VideoStabilizationAction,
      options?: { mode?: VideoStabilizationMode; strength?: number },
    ) {
      const response = await fetch(`/api/projects/${projectId}/timeline/elements/${elementId}/video-stabilization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...options }),
      });
      const body = await readJsonSafe<{
        elements?: TimelineElement[];
        transitions?: TimelineTransition[];
        error?: string;
      }>(response, {});
      return { response, body };
    },

    async deleteElement(elementId: string) {
      const response = await fetch(`/api/projects/${projectId}/timeline/elements/${elementId}`, {
        method: "DELETE",
      });
      const body = await readJsonSafe<DeleteElementResponse>(response, {});
      return { response, body };
    },

    async splitElement(elementId: string, splitAt: number) {
      const response = await fetch(`/api/projects/${projectId}/timeline/elements/${elementId}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ split_at: Number(splitAt.toFixed(3)) }),
      });
      const body = await readJsonSafe<SplitElementResponse>(response, {});
      return { response, body };
    },

    async duplicateElement(elementId: string) {
      const response = await fetch(`/api/projects/${projectId}/timeline/elements/${elementId}/duplicate`, {
        method: "POST",
      });
      const body = await readJsonSafe<DuplicateElementResponse>(response, {});
      return { response, body };
    },

    async createElement(payload: Record<string, unknown>) {
      const response = await fetch(`/api/projects/${projectId}/timeline/elements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await readJsonSafe<CreateElementResponse>(response, {});
      return { response, body };
    },

    async patchBeatDuration(beatId: string, durationSeconds: number, fallbackMessage: string) {
      const response = await fetch(`/api/projects/${projectId}/beats/${beatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration_seconds: durationSeconds }),
      });
      const body = await readJsonSafe<JsonObject>(response, {});
      assertOk(response, body, fallbackMessage);
    },

    async saveLaneOrderKeys(laneOrderKeys: string[]) {
      const response = await fetch(`/api/projects/${projectId}/timeline/lane-order`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lane_order_keys: laneOrderKeys }),
      });
      const body = await readJsonSafe<LaneOrderResponse>(response, {});
      return { response, body };
    },

    async saveMutedLaneKeys(mutedLaneKeys: string[]) {
      const response = await fetch(`/api/projects/${projectId}/timeline/muted-lanes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muted_lane_keys: mutedLaneKeys }),
      });
      const body = await readJsonSafe<MutedLaneResponse>(response, {});
      return { response, body };
    },

    async saveHiddenLaneKeys(hiddenLaneKeys: string[]) {
      const response = await fetch(`/api/projects/${projectId}/timeline/muted-lanes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden_lane_keys: hiddenLaneKeys }),
      });
      const body = await readJsonSafe<MutedLaneResponse>(response, {});
      return { response, body };
    },

    async saveOutputFrameRate(frameRate: number) {
      const response = await fetch(`/api/projects/${projectId}/timeline/output-format`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frame_rate: frameRate }),
      });
      const body = await readJsonSafe<OutputFormatResponse>(response, {});
      return { response, body };
    },

    async saveOutputAspectRatio(aspectRatio: TimelineAspectRatio) {
      const response = await fetch(`/api/projects/${projectId}/timeline/output-format`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aspect_ratio: aspectRatio }),
      });
      const body = await readJsonSafe<OutputFormatResponse>(response, {});
      return { response, body };
    },

    async patchLaneDefaults(laneKey: string, styleProps: Record<string, unknown>) {
      const response = await fetch(`/api/projects/${projectId}/timeline/lane-defaults`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lane_key: laneKey, style_props: styleProps }),
      });
      const body = await readJsonSafe<LaneDefaultsResponse>(response, {});
      return { response, body };
    },

    async applyLaneDefaults(laneKey: string, styleProps: Record<string, unknown>) {
      const response = await fetch(`/api/projects/${projectId}/timeline/lane-defaults`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lane_key: laneKey, style_props: styleProps }),
      });
      const body = await readJsonSafe<LaneDefaultsResponse>(response, {});
      return { response, body };
    },

    async createTransition(payload: Record<string, unknown>) {
      const response = await fetch(`/api/projects/${projectId}/timeline/transitions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await readJsonSafe<TransitionResponse>(response, {});
      return { response, body };
    },

    async patchTransition(transitionId: string, patch: Record<string, unknown>) {
      const response = await fetch(`/api/projects/${projectId}/timeline/transitions/${transitionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await readJsonSafe<TransitionResponse>(response, {});
      return { response, body };
    },

    async deleteTransition(transitionId: string) {
      const response = await fetch(`/api/projects/${projectId}/timeline/transitions/${transitionId}`, {
        method: "DELETE",
      });
      const body = await readJsonSafe<TransitionResponse | JsonObject>(response, {});
      return { response, body };
    },
  };
}
