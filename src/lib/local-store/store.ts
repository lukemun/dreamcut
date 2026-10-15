import { createHash, randomUUID } from "node:crypto";
import { changedSince, splitSingleWordCaptions } from "@/lib/timeline/caption-word-elements";
import { safeMemoryEvent } from "./editing-memory";
import { currentEditAttribution, withFeedbackAttribution, type EditAttribution } from "./edit-attribution";
import fs from "node:fs";
import { traceSync } from "@/lib/observability/sync-span";
import path from "node:path";

import type { TimelineElement, TimelineTransition } from "@/components/studio/timeline/types";
import {
  isCaptionSafeAreaMode,
  isDeliveryTarget,
  type CaptionSafeAreaMode,
  type DeliveryTarget,
} from "@/lib/qc/standards";
import { isTimelineAspectRatioValue, type TimelineAspectRatioValue } from "@/lib/aspect-ratios";
import { DEFAULT_PROJECT_FRAME_RATE, isProjectFrameRate, projectFrameRate, type ProjectFrameRate } from "@/lib/timeline/frame-quantization";
import {
  projectAgentWriteLeasePath,
  projectAssemblyHandoffPath,
  projectAgentWorkspaceRevokedPath,
  projectDir,
  projectExists,
  projectFrameTagsPath,
  projectHistoryDir,
  projectLayoutProposalPath,
  projectLayoutProposalsDir,
  projectMetadataPath,
  projectPeaksPath,
  projectProposalPath,
  projectTimelinePath,
  isSafeProposalId,
} from "@/lib/local-store/paths";
import { readJsonFile, writeJsonFileAtomic } from "@/lib/local-store/atomic-json";
import {
  CURRENT_TIMELINE_SCHEMA_VERSION,
  migrateTimelineFile,
  type RawTimelineFile,
} from "@/lib/local-store/timeline-migrations";
import { stripRuntimePreviewPropsFromTimeline } from "@/lib/timeline/runtime-preview-props";
import { resolveHiddenLaneKeys } from "@/lib/timeline/metadata";
import { describeTimelineElementChange, historyOperationLabel, sanitizeHistoryLabel, type HistoryElementLike } from "@/lib/timeline/history-label";
import { assertGpuWriteAdmissible } from "@/lib/timeline/gpu-write-admission";
import type { FrameTagsFile } from "@/lib/review/frame-tag-types";

export { readJsonFile, writeJsonFileAtomic } from "@/lib/local-store/atomic-json";

// ── Shapes on disk ───────────────────────────────────────────────────────────
// timeline.json is the single source of truth a coding agent edits directly:
// full rows, snake_case, soft-deleted rows kept (removed_at/removed_reason),
// exactly like the app's timeline_elements / timeline_transitions tables.

export type TimelineFile = {
  elements: TimelineElement[];
  transitions: TimelineTransition[];
};

export type ProjectMetadata = {
  lane_order_keys: string[];
  lane_defaults: Record<string, Record<string, unknown>>;
  /** Lanes whose sound is silent in preview and export; pictures still draw. */
  muted_lane_keys: string[];
  /** Lanes whose pictures and text are not drawn in preview or export; sound still plays unless muted. */
  hidden_lane_keys: string[];
  output_aspect_ratio: TimelineAspectRatioValue;
  /** Composition frame rate. Absent means 30 (projects created before rates were selectable). */
  frame_rate?: ProjectFrameRate;
  delivery_target: DeliveryTarget;
  caption_safe_area_mode?: CaptionSafeAreaMode;
  media_preprocessing_enabled?: boolean;
  title?: string;
  version_group_id?: string;
  version_label?: string;
  version_order?: number;
  /**
   * Assembly grant. True only for a project an agent assembly/audition flow created
   * (see `createProject`'s `agentWorkspace` option); it lets the MCP mutation tools
   * write this project directly instead of going through proposal review. Granted at
   * creation, never afterwards, and cleared for good by the first human edit
   * (`applyAgentWorkspaceLatch`).
   */
  agent_workspace?: boolean;
};

export type PeaksEntry = {
  peaks: number[];
  source_duration_seconds: number;
};

export type PeaksFile = Record<string, PeaksEntry>;

const EMPTY_TIMELINE: TimelineFile = { elements: [], transitions: [] };
const EMPTY_FRAME_TAGS: FrameTagsFile = { schema_version: 1, next_number: 1, tags: [] };

const DEFAULT_METADATA: ProjectMetadata = {
  lane_order_keys: [],
  lane_defaults: {},
  muted_lane_keys: [],
  hidden_lane_keys: [],
  output_aspect_ratio: "16:9",
  delivery_target: "web",
  caption_safe_area_mode: "paid_ad",
};

// ── Revision tracking ────────────────────────────────────────────────────────
// Every API write records the resulting timeline.json mtime. A newer mtime the
// API didn't produce means an external edit (e.g. Claude Code editing the file),
// which the UI polls for and reloads on.
//
// The record lives in a SIDECAR FILE, not module memory. Next dev bundles route
// handlers separately and resets module state on every recompile — with in-memory
// bookkeeping, the instance answering the revision poll never saw the instance
// that performed the write, so the UI's own edits were flagged external and the
// editor reloaded from disk mid-session. Disk is the only store all instances share.

type ApiWriteMarker = { apiMtimeMs: number; externalRevMs: number; pid: number };

function apiWriteMarkerPath(projectId: string): string {
  return path.join(projectDir(projectId), ".last-api-write.json");
}

function readApiWriteMarker(projectId: string): ApiWriteMarker | null {
  try {
    const raw = JSON.parse(fs.readFileSync(apiWriteMarkerPath(projectId), "utf8")) as Partial<ApiWriteMarker>;
    if (typeof raw.apiMtimeMs !== "number") return null;
    return {
      apiMtimeMs: raw.apiMtimeMs,
      externalRevMs: typeof raw.externalRevMs === "number" ? raw.externalRevMs : 0,
      pid: typeof raw.pid === "number" ? raw.pid : 0,
    };
  } catch {
    return null;
  }
}

function writeApiWriteMarker(projectId: string, marker: ApiWriteMarker) {
  writeJsonFileAtomic(apiWriteMarkerPath(projectId), marker);
}

/**
 * Called after every store write so the poller can tell this process's writes from external ones.
 * An MCP agent's write arrives through this same server process, yet the open editor did not make
 * it, so it advances the external revision and the editor reloads (e.g. a new video shape).
 */
function recordApiWrite(projectId: string) {
  const previous = readApiWriteMarker(projectId);
  const apiMtimeMs = projectStateMtimeMs(projectId);
  const agentWrite = currentEditAttribution("store_write").attribution_source === "mcp_request";
  writeApiWriteMarker(projectId, {
    apiMtimeMs,
    externalRevMs: agentWrite ? Math.max(apiMtimeMs, (previous?.externalRevMs ?? 0) + 1) : previous?.externalRevMs ?? 0,
    pid: process.pid,
  });
}

function statMtimeMs(filePath: string): number {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function layoutProposalsMtimeMs(projectId: string) {
  const dir = projectLayoutProposalsDir(projectId);
  let latest = 0;
  try {
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.endsWith(".json")) continue;
      latest = Math.max(latest, statMtimeMs(path.join(dir, entry)));
    }
  } catch {
    return 0;
  }
  return latest;
}

function projectStateMtimeMs(projectId: string) {
  return Math.max(
    statMtimeMs(projectTimelinePath(projectId)),
    statMtimeMs(projectMetadataPath(projectId)),
    statMtimeMs(projectFrameTagsPath(projectId)),
    statMtimeMs(projectAuditionsPath(projectId)),
    layoutProposalsMtimeMs(projectId),
  );
}

export function getRevision(projectId: string): { rev: number; externalRev: number } {
  const mtime = projectStateMtimeMs(projectId);
  const marker = readApiWriteMarker(projectId);
  if (marker === null) {
    // First look at this project: baseline, don't treat pre-existing history as external.
    writeApiWriteMarker(projectId, { apiMtimeMs: mtime, externalRevMs: 0, pid: process.pid });
    return { rev: mtime, externalRev: 0 };
  }
  // External = the file changed without a matching marker (a direct file edit), OR the last
  // store write came from another process (a CLI script like captions-from-alignment writing
  // through writeTimeline). Both should reload the open editor. Writes from THIS server
  // process — the UI's own mutations — never flag, no matter which route-bundle module
  // instance recorded them, because the marker lives on disk, not in module memory.
  const external = mtime !== marker.apiMtimeMs || marker.pid !== process.pid;
  if (external) {
    const next = { apiMtimeMs: mtime, externalRevMs: mtime, pid: process.pid };
    writeApiWriteMarker(projectId, next);
    return { rev: mtime, externalRev: next.externalRevMs };
  }
  return { rev: mtime, externalRev: marker.externalRevMs };
}

// ── Serialized mutations ─────────────────────────────────────────────────────
// Route handlers read-modify-write JSON files; a per-project promise chain
// keeps concurrent requests from clobbering each other.

const projectLocks = new Map<string, Promise<unknown>>();

export async function withProjectLock<T>(projectId: string, fn: () => Promise<T> | T): Promise<T> {
  const previous = projectLocks.get(projectId) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  projectLocks.set(projectId, next.catch(() => undefined));
  return next;
}

export function assertProject(projectId: string) {
  if (!projectExists(projectId)) {
    const error = new Error(`Project not found: ${projectId}`);
    (error as Error & { status?: number }).status = 404;
    throw error;
  }
}

import { resolveOutlineLayers } from "@/lib/timeline/outline-layer";

function normalizeReadTimeline(data: RawTimelineFile): TimelineFile {
  const timeline = migrateTimelineFile(data).timeline;
  return { ...timeline, elements: resolveOutlineLayers(timeline.elements) };
}

/** Revision and normalized context derive from the same immutable byte read. */
export function readTimelineSnapshot(projectId: string) {
  assertProject(projectId);
  const bytes = fs.readFileSync(projectTimelinePath(projectId));
  return { revision: createHash("sha256").update(bytes).digest("hex"),
    timeline: normalizeReadTimeline(JSON.parse(bytes.toString("utf8")) as RawTimelineFile) };
}

export function readTimeline(projectId: string): TimelineFile {
  return traceSync("timeline.read", () => {
  assertProject(projectId);
  const data = readJsonFile<RawTimelineFile>(projectTimelinePath(projectId), EMPTY_TIMELINE);
  // Migrate on read, pure: hand-edited or pre-versioning files are normalized to
  // the current schema in memory; disk is only stamped on the next real write
  // (a write-back here would race the editor's 2s external-change poll).
  return normalizeReadTimeline(data);
  });
}

/**
 * The project's frame rate for snapping, preparation and export. Never fails: a project whose
 * metadata cannot be read (an incomplete fixture, a referenced project mid-write) is 30 fps.
 */
export function readProjectFrameRate(projectId: string): ProjectFrameRate {
  try { return projectFrameRate(readMetadata(projectId)); } catch { return DEFAULT_PROJECT_FRAME_RATE; }
}

const KNOWN_METADATA_FIELDS = new Set(["lane_order_keys", "lane_defaults", "muted_lane_keys", "hidden_lane_keys", "output_aspect_ratio",
  "frame_rate", "delivery_target", "caption_safe_area_mode", "media_preprocessing_enabled", "title", "version_group_id", "version_label",
  "version_order", "agent_workspace"]);

export function readMetadata(projectId: string): ProjectMetadata {
  assertProject(projectId);
  const data = readJsonFile<Partial<ProjectMetadata>>(projectMetadataPath(projectId), DEFAULT_METADATA);
  const mutedLaneKeys = Array.isArray(data.muted_lane_keys) ? data.muted_lane_keys : [];
  // Library contract: fields from a newer DreamCut survive this version's read and rewrite. Only the
  // known fields below carry meaning here, so an unknown field can never grant behaviour or authority.
  const unknownFields = Object.fromEntries(Object.entries(data).filter(([key]) => !KNOWN_METADATA_FIELDS.has(key)));
  return {
    ...unknownFields,
    lane_order_keys: Array.isArray(data.lane_order_keys) ? data.lane_order_keys : [],
    lane_defaults:
      data.lane_defaults && typeof data.lane_defaults === "object" ? data.lane_defaults : {},
    muted_lane_keys: mutedLaneKeys,
    // Legacy metadata (no hidden_lane_keys) keeps "mute hides everything" for muted visual lanes.
    hidden_lane_keys: resolveHiddenLaneKeys(
      (data as { hidden_lane_keys?: unknown }).hidden_lane_keys,
      mutedLaneKeys,
      () => readTimeline(projectId).elements,
    ),
    output_aspect_ratio: isTimelineAspectRatioValue(data.output_aspect_ratio) ? data.output_aspect_ratio : "16:9",
    ...(isProjectFrameRate(data.frame_rate) ? { frame_rate: data.frame_rate } : {}),
    delivery_target: isDeliveryTarget(data.delivery_target)
      ? data.delivery_target
      : (() => { throw new Error(`Project ${projectId} has no valid delivery_target`); })(),
    caption_safe_area_mode: isCaptionSafeAreaMode(data.caption_safe_area_mode)
      ? data.caption_safe_area_mode
      : "paid_ad",
    ...(data.media_preprocessing_enabled === true ? { media_preprocessing_enabled: true } : {}),
    ...(typeof data.title === "string" ? { title: data.title } : {}),
    ...(typeof data.version_group_id === "string" && data.version_group_id.trim().length > 0
      ? { version_group_id: data.version_group_id.trim() }
      : {}),
    ...(typeof data.version_label === "string" && data.version_label.trim().length > 0
      ? { version_label: data.version_label.trim() }
      : {}),
    ...(typeof data.version_order === "number" && Number.isFinite(data.version_order)
      ? { version_order: data.version_order }
      : {}),
    ...(data.agent_workspace === true ? { agent_workspace: true } : {}),
  };
}

export function readPeaks(projectId: string): PeaksFile {
  return readJsonFile<PeaksFile>(projectPeaksPath(projectId), {});
}

function readFrameTagsSnapshot(projectId: string): FrameTagsFile {
  return readJsonFile<FrameTagsFile>(projectFrameTagsPath(projectId), EMPTY_FRAME_TAGS);
}

function projectAuditionsPath(projectId: string) {
  return path.join(projectDir(projectId), "analysis", "auditions.json");
}

/** Raw auditions receipt for snapshot embedding, or null when the project has none. */
function readAuditionsSnapshot(projectId: string): unknown | null {
  const auditionsPath = projectAuditionsPath(projectId);
  if (!fs.existsSync(auditionsPath)) return null;
  return readJsonFile<unknown>(auditionsPath, null);
}

function isSafeLayoutProposalId(layoutId: string) {
  return /^[a-zA-Z0-9_-]+$/.test(layoutId);
}

function readLayoutProposalSnapshot(projectId: string, layoutId: string): unknown | null {
  if (!isSafeLayoutProposalId(layoutId)) return null;
  const proposalPath = projectLayoutProposalPath(projectId, layoutId);
  if (!fs.existsSync(proposalPath)) return null;
  return readJsonFile<unknown>(proposalPath, null);
}

function readProposalSnapshot(projectId: string, proposalId: string): unknown | null {
  if (!isSafeProposalId(proposalId)) return null;
  const proposalPath = projectProposalPath(projectId, proposalId);
  if (!fs.existsSync(proposalPath)) return null;
  return readJsonFile<unknown>(proposalPath, null);
}

function snapshotHistory(
  projectId: string,
  op: string,
  timeline: TimelineFile,
  metadata: ProjectMetadata,
  frameTags = readFrameTagsSnapshot(projectId),
  auditions = readAuditionsSnapshot(projectId),
  layoutProposals?: Record<string, unknown>,
  proposals?: Record<string, unknown>,
  label?: string | null,
) {
  const historyDir = projectHistoryDir(projectId);
  fs.mkdirSync(historyDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeOp = op.replace(/[^a-z0-9_-]/gi, "_").slice(0, 60);
  const id = `${stamp}-${safeOp}.json`;
  const at = new Date().toISOString();
  const attribution = currentEditAttribution(op);
  writeJsonFileAtomic(path.join(historyDir, id), {
    op,
    at,
    ...attribution,
    // Plain description of what changed; listed before the timeline so history
    // pages can read it from the bounded header.
    ...(label ? { label } : {}),
    timeline,
    metadata,
    frame_tags: frameTags,
    // Auditions ride along whenever the receipt exists; layout proposals are
    // embedded only by ops that touch them (they can be large per proposal).
    ...(auditions != null ? { auditions } : {}),
    ...(layoutProposals && Object.keys(layoutProposals).length > 0
      ? { layout_proposals: layoutProposals }
      : {}),
    ...(proposals && Object.keys(proposals).length > 0
      ? { proposals }
      : {}),
  });
  if (!op.endsWith("_before")) safeMemoryEvent(projectId, {
    id: `history:${id}`, time: at, type: "timeline.snapshot", actor: attribution.actor,
    data: { ...attribution },
    summary: op.replaceAll("_", " "), evidence: id,
  });
  return { id, op, at } satisfies ProjectHistorySnapshotDescriptor;
}

export type ProjectHistorySnapshotDescriptor = {
  id: string;
  op: string;
  at: string;
};

type ProjectHistorySnapshot = ProjectHistorySnapshotDescriptor & Partial<EditAttribution> & {
  timeline: TimelineFile;
  metadata: ProjectMetadata;
  frame_tags?: FrameTagsFile;
  auditions?: unknown;
  layout_proposals?: Record<string, unknown>;
  proposals?: Record<string, unknown>;
};

export type ProjectMutationHistory = {
  before: ProjectHistorySnapshotDescriptor;
  after: ProjectHistorySnapshotDescriptor;
};

export function captureProjectHistorySnapshot(
  projectId: string,
  op: string,
  extras?: { layoutProposalIds?: string[]; proposalIds?: string[] },
) {
  assertProject(projectId);
  const layoutProposals = extras?.layoutProposalIds?.length
    ? Object.fromEntries(
      extras.layoutProposalIds
        .map((layoutId) => [layoutId, readLayoutProposalSnapshot(projectId, layoutId)] as const)
        .filter(([, value]) => value != null),
    )
    : undefined;
  const proposals = extras?.proposalIds?.length
    ? Object.fromEntries(
      [...new Set(extras.proposalIds)]
        .map((proposalId) => [proposalId, readProposalSnapshot(projectId, proposalId)] as const)
        .filter(([, value]) => value != null),
    )
    : undefined;
  return snapshotHistory(
    projectId,
    op,
    readTimeline(projectId),
    readMetadata(projectId),
    undefined,
    undefined,
    layoutProposals,
    proposals,
  );
}

/** Mark a non-timeline project file write as part of the shared revision stream. */
export function recordProjectStateWrite(projectId: string) {
  assertProject(projectId);
  recordApiWrite(projectId);
}

function isSafeHistorySnapshotId(id: string) {
  return id.endsWith(".json") && path.basename(id) === id && !id.includes("..") && !id.includes("/") && !id.includes("\\");
}

export function latestProjectHistorySnapshot(projectId: string): ProjectHistorySnapshotDescriptor | null {
  assertProject(projectId);
  const historyDir = projectHistoryDir(projectId);
  const id = fs.existsSync(historyDir)
    ? fs.readdirSync(historyDir).filter((entry) => isSafeHistorySnapshotId(entry)).sort().at(-1)
    : undefined;
  if (!id) return null;
  const snapshot = readJsonFile<Partial<ProjectHistorySnapshot>>(path.join(historyDir, id), {});
  return {
    id,
    op: typeof snapshot.op === "string" ? snapshot.op : "timeline_write",
    at: typeof snapshot.at === "string" ? snapshot.at : id,
  };
}

/** Name a restore after the step it returns to: the editor's Undo label, else the restored snapshot's own edit. */
function restoredHistoryLabel(snapshot: Partial<ProjectHistorySnapshot> & { label?: unknown }) {
  const requested = sanitizeHistoryLabel(currentEditAttribution("history_restore").history_label);
  if (requested) return requested;
  const own = sanitizeHistoryLabel(snapshot.label);
  if (own) return own;
  return typeof snapshot.op === "string" ? historyOperationLabel(snapshot.op.replace(/_(before|after)$/, "")) : null;
}

/**
 * Describe a timeline write from the elements it changed. An Undo replay writes
 * the inverse of the original edit, so it is described in reverse to name that edit.
 */
function timelineWriteLabel(projectId: string, op: string, next: TimelineFile) {
  try {
    const previous = readJsonFile<Partial<TimelineFile>>(projectTimelinePath(projectId), {}).elements as HistoryElementLike[] | undefined;
    const elements = next.elements as unknown as HistoryElementLike[];
    const action = currentEditAttribution(op).history_action;
    return action === "undo"
      ? describeTimelineElementChange(elements, previous)
      : describeTimelineElementChange(previous, elements, { restoreVerb: op === "element_restore" && !action });
  } catch {
    return null;
  }
}

export function restoreProjectHistorySnapshot(projectId: string, snapshotId: string, op = "history_restore") {
  assertProject(projectId);
  if (!isSafeHistorySnapshotId(snapshotId)) throw Object.assign(new Error("Invalid history snapshot id"), { status: 400 });
  const snapshotPath = path.join(projectHistoryDir(projectId), snapshotId);
  if (!fs.existsSync(snapshotPath)) throw Object.assign(new Error("History snapshot not found"), { status: 404 });
  const snapshot = readJsonFile<Partial<ProjectHistorySnapshot>>(snapshotPath, {});
  if (!snapshot.timeline || !Array.isArray(snapshot.timeline.elements) || !Array.isArray(snapshot.timeline.transitions) || !snapshot.metadata) {
    throw Object.assign(new Error("History snapshot is invalid"), { status: 422 });
  }
  // Resolve the latch from the CURRENT disk state before either file moves: a snapshot
  // taken while the grant was live must not restore it after a human edit revoked it.
  const metadata = resolveAgentWorkspace(projectId, snapshot.metadata as ProjectMetadata, op);
  const timelineChanged = JSON.stringify(readJsonFile(projectTimelinePath(projectId), {})) !== JSON.stringify(snapshot.timeline);
  const metadataChanged = JSON.stringify(readJsonFile(projectMetadataPath(projectId), {})) !== JSON.stringify(metadata);
  if (timelineChanged) writeJsonFileAtomic(projectTimelinePath(projectId), snapshot.timeline);
  if (metadataChanged) writeJsonFileAtomic(projectMetadataPath(projectId), metadata);
  if (snapshot.frame_tags) {
    fs.mkdirSync(path.dirname(projectFrameTagsPath(projectId)), { recursive: true });
    writeJsonFileAtomic(projectFrameTagsPath(projectId), snapshot.frame_tags);
  }
  if (snapshot.auditions != null) {
    fs.mkdirSync(path.dirname(projectAuditionsPath(projectId)), { recursive: true });
    writeJsonFileAtomic(projectAuditionsPath(projectId), snapshot.auditions);
  }
  if (snapshot.layout_proposals) {
    for (const [layoutId, proposal] of Object.entries(snapshot.layout_proposals)) {
      if (!isSafeLayoutProposalId(layoutId) || proposal == null) continue;
      fs.mkdirSync(projectLayoutProposalsDir(projectId), { recursive: true });
      writeJsonFileAtomic(projectLayoutProposalPath(projectId, layoutId), proposal);
    }
  }
  const restoredProposalIds: string[] = [];
  if (snapshot.proposals) {
    for (const [proposalId, proposal] of Object.entries(snapshot.proposals)) {
      if (!isSafeProposalId(proposalId) || proposal == null) continue;
      fs.mkdirSync(path.dirname(projectProposalPath(projectId, proposalId)), { recursive: true });
      writeJsonFileAtomic(projectProposalPath(projectId, proposalId), proposal);
      restoredProposalIds.push(proposalId);
    }
  }
  recordApiWrite(projectId);
  const restoredSnapshot = withFeedbackAttribution({
    responds_to_feedback_ids: snapshot.responds_to_feedback_ids, proposal_ids: snapshot.proposal_ids, restores_snapshot_id: snapshotId,
  }, () => snapshotHistory(projectId, op, snapshot.timeline!, metadata, undefined, undefined, undefined, undefined, restoredHistoryLabel(snapshot)));
  return {
    timeline: snapshot.timeline,
    metadata,
    restoredSnapshotId: restoredSnapshot.id,
    restoredProposalIds,
    timelineChanged: timelineChanged || metadataChanged,
  };
}

// ── Agent-workspace latch ────────────────────────────────────────────────────
// `agent_workspace` is the assembly grant: inside such a project the MCP mutation
// tools may write the timeline directly (mcp/proposal-gate.mjs). The grant is a
// ONE-WAY latch — the first layout handoff or human edit clears it for good and the project becomes a
// normal proposal-gated working timeline. There is no re-grant path: only
// createProject may set the flag, and only on a project that does not exist yet.
//
// Telling the two writers apart is the whole problem: the editor UI and the agent's
// MCP both arrive as the same HTTP route on the same dev-server process, so neither
// the route, the op, nor the pid distinguishes them. Two signals do:
//
//  1. An op prefixed `editor_agent_` is an approved proposal being applied. The human
//     only clicked Approve; the editorial work is the agent's, so it does not revoke.
//     `timeline_compaction` is mechanical housekeeping and does not revoke either.
//  2. Everything else revokes UNLESS a live agent-write lease sits in the project dir.
//     The MCP server writes that lease around each granted mutation call and deletes it
//     after (mcp/proposal-gate.mjs `withAgentWriteLease`). A sidecar file is the only
//     store both processes share — the same reason the revision marker above lives on
//     disk rather than in module memory.
//
// Polarity matters: attribution is required to KEEP the grant, never to gain it. Any
// write we cannot attribute to the agent — a UI click, a CLI script, a hand edit that
// later flows through a write — is treated as the human taking over and revokes.
// A lease that leaks (crashed MCP process) expires on its own within
// AGENT_WRITE_LEASE_TTL_MS and can only ever delay a revoke, never undo one.

type AgentWriteLease = { expires_at_ms?: number };

/** On-disk latch state, read raw so an invalid metadata file cannot resurrect the grant. */
function agentWorkspaceOnDisk(projectId: string): boolean {
  return !fs.existsSync(projectAssemblyHandoffPath(projectId))
    && readJsonFile<Partial<ProjectMetadata>>(projectMetadataPath(projectId), {}).agent_workspace === true;
}

function hasLiveAgentWriteLease(projectId: string): boolean {
  const lease = readJsonFile<AgentWriteLease>(projectAgentWriteLeasePath(projectId), {});
  return typeof lease.expires_at_ms === "number" && lease.expires_at_ms > Date.now();
}

function writeKeepsAgentWorkspace(projectId: string, op: string): boolean {
  if (op.startsWith("editor_agent_")) return true;
  if (op === "timeline_compaction") return true;
  // The first take-audition build creates the project inside a child process. The
  // parent MCP server cannot place its write lease until that project directory
  // exists, so these two bootstrap writes must preserve the grant explicitly.
  if (op === "create_take_audition" || op === "configure_take_audition") return true;
  return hasLiveAgentWriteLease(projectId);
}

/** Clear the grant on disk when this write is not attributable to the agent. */
function applyAgentWorkspaceLatch(projectId: string, op: string) {
  if (!agentWorkspaceOnDisk(projectId)) return;
  if (writeKeepsAgentWorkspace(projectId, op)) return;
  const metadata = readMetadata(projectId);
  delete metadata.agent_workspace;
  writeJsonFileAtomic(projectMetadataPath(projectId), metadata);
  recordAgentWorkspaceRevoked(projectId, op);
}

function recordAgentWorkspaceRevoked(projectId: string, op: string) {
  writeJsonFileAtomic(projectAgentWorkspaceRevokedPath(projectId), { schema_version: 1, revoked_at: new Date().toISOString(), op });
}

/**
 * Resolve `agent_workspace` for a metadata write: carried when the write is the
 * agent's own, cleared otherwise, and NEVER set from the caller's object — a metadata
 * round-trip (lane order, muted lanes, output format, a restored history snapshot)
 * must not be able to hand back a grant the latch already took away.
 */
function resolveAgentWorkspace(projectId: string, metadata: ProjectMetadata, op: string): ProjectMetadata {
  const next = { ...metadata };
  delete next.agent_workspace;
  if (agentWorkspaceOnDisk(projectId)) {
    if (writeKeepsAgentWorkspace(projectId, op)) next.agent_workspace = true;
    else recordAgentWorkspaceRevoked(projectId, op);
  }
  return next;
}

/** True while this project still carries the agent assembly grant. */
export function isAgentWorkspaceProject(projectId: string): boolean {
  return projectExists(projectId) && agentWorkspaceOnDisk(projectId);
}

/** Reject an already-dispatched direct agent write after handoff, before touching files. */
function assertNoHandedOffAgentWrite(projectId: string, op: string) {
  if (fs.existsSync(projectAssemblyHandoffPath(projectId)) && hasLiveAgentWriteLease(projectId)
      && !op.startsWith("editor_agent_") && op !== "timeline_compaction") {
    throw new Error("First assembly was handed off. Use proposal_create for further edits.");
  }
}

/**
 * GPU-first rule for direct agent writes: a leased agent_workspace mutation (MCP element,
 * transition and batch tools) may not introduce content Browser GPU cannot draw. Approved
 * proposals (`editor_agent_*`) were admitted when validated; human writes are not gated here.
 */
function assertAgentWorkspaceWriteGpuAdmissible(projectId: string, timeline: TimelineFile, op: string) {
  if (op.startsWith("editor_agent_") || op === "timeline_compaction") return;
  if (!agentWorkspaceOnDisk(projectId) || !hasLiveAgentWriteLease(projectId)) return;
  assertGpuWriteAdmissible(readTimeline(projectId), timeline, `Agent workspace write ${op}`);
}

/** A caption holds exactly the words it shows: split the one-word-at-a-time captions this write adds or changes. */
function splitChangedSingleWordCaptions(projectId: string, timeline: TimelineFile) {
  if (!timeline.elements.some((element) => element.type === "caption_text" && element.props?.timingMode === "single_word")) return;
  const onDisk = fs.existsSync(projectTimelinePath(projectId)) ? readTimeline(projectId).elements : [];
  splitSingleWordCaptions(timeline.elements, { fps: readProjectFrameRate(projectId), only: changedSince(onDisk) });
}

/** Persist a timeline mutation: atomic write + history snapshot + revision bookkeeping. */
export function writeTimeline(projectId: string, timeline: TimelineFile, op: string) {
  return traceSync("timeline.write", () => {
  assertProject(projectId);
  assertNoHandedOffAgentWrite(projectId, op);
  assertAgentWorkspaceWriteGpuAdmissible(projectId, timeline, op);
  splitChangedSingleWordCaptions(projectId, timeline);
  const durableTimeline = stripRuntimePreviewPropsFromTimeline({ ...timeline, elements: resolveOutlineLayers(timeline.elements) });
  const label = op.endsWith("_before") ? null : timelineWriteLabel(projectId, op, durableTimeline);
  writeJsonFileAtomic(projectTimelinePath(projectId), {
    schema_version: CURRENT_TIMELINE_SCHEMA_VERSION,
    ...durableTimeline,
  });
  applyAgentWorkspaceLatch(projectId, op);
  recordApiWrite(projectId);
  snapshotHistory(projectId, op, durableTimeline, readMetadata(projectId), undefined, undefined, undefined, undefined, label);
  });
}

/** Persist a change that spans the timeline and project settings as one undoable step. */
export function writeTimelineAndMetadata(projectId: string, timeline: TimelineFile, metadata: ProjectMetadata, op: string) {
  assertProject(projectId);
  assertNoHandedOffAgentWrite(projectId, op);
  splitChangedSingleWordCaptions(projectId, timeline);
  const durableTimeline = stripRuntimePreviewPropsFromTimeline({ ...timeline, elements: resolveOutlineLayers(timeline.elements) });
  const next = resolveAgentWorkspace(projectId, metadata, op);
  writeJsonFileAtomic(projectTimelinePath(projectId), { schema_version: CURRENT_TIMELINE_SCHEMA_VERSION, ...durableTimeline });
  writeJsonFileAtomic(projectMetadataPath(projectId), next);
  applyAgentWorkspaceLatch(projectId, op);
  recordApiWrite(projectId);
  snapshotHistory(projectId, op, durableTimeline, next);
}

export function writeMetadata(projectId: string, metadata: ProjectMetadata, op: string) {
  assertProject(projectId);
  assertNoHandedOffAgentWrite(projectId, op);
  const next = resolveAgentWorkspace(projectId, metadata, op);
  writeJsonFileAtomic(projectMetadataPath(projectId), next);
  recordApiWrite(projectId);
  snapshotHistory(projectId, op, readTimeline(projectId), next);
}

export function writePeaks(projectId: string, peaks: PeaksFile) {
  assertProject(projectId);
  writeJsonFileAtomic(projectPeaksPath(projectId), peaks);
}

export function createProject(
  projectId: string,
  deliveryTarget: DeliveryTarget,
  title?: string,
  options?: {
    /**
     * Grant the assembly latch: an agent assembly/audition flow is authoring this
     * project, so MCP mutation tools may write it directly until a human edits it.
     * The `!fs.existsSync` guard below is what makes the grant unforgeable on an
     * existing project — creating over one leaves its metadata (and its cleared
     * latch) untouched.
     */
    agentWorkspace?: boolean;
    outputAspectRatio?: ProjectMetadata["output_aspect_ratio"];
    frameRate?: ProjectFrameRate;
  },
) {
  const dir = projectDir(projectId);
  fs.mkdirSync(path.join(dir, "media"), { recursive: true });
  fs.mkdirSync(path.join(dir, "renders"), { recursive: true });
  fs.mkdirSync(path.join(dir, "history"), { recursive: true });
  if (!fs.existsSync(projectTimelinePath(projectId))) {
    writeJsonFileAtomic(projectTimelinePath(projectId), EMPTY_TIMELINE);
  }
  if (!fs.existsSync(projectMetadataPath(projectId))) {
    writeJsonFileAtomic(projectMetadataPath(projectId), {
      ...DEFAULT_METADATA,
      delivery_target: deliveryTarget,
      ...(options?.outputAspectRatio ? { output_aspect_ratio: options.outputAspectRatio } : {}),
      ...(options?.frameRate ? { frame_rate: options.frameRate } : {}),
      ...(title ? { title } : {}),
      ...(options?.agentWorkspace ? { agent_workspace: true } : {}),
    });
  }
}

// ── Row helpers (mirror the DB ordering + soft-delete semantics) ─────────────

export function activeElements(timeline: TimelineFile): TimelineElement[] {
  return timeline.elements
    .filter((element) => element.removed_at == null)
    .sort(
      (a, b) =>
        (a.lane_index ?? 0) - (b.lane_index ?? 0)
        || (a.timeline_start ?? 0) - (b.timeline_start ?? 0)
        || String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")),
    );
}

export function activeTransitions(timeline: TimelineFile): TimelineTransition[] {
  return timeline.transitions
    .filter((transition) => transition.removed_at == null)
    .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
}

export function findElement(timeline: TimelineFile, elementId: string): TimelineElement | undefined {
  return timeline.elements.find((element) => element.id === elementId);
}

export function newRowTimestamps() {
  const now = new Date().toISOString();
  return { created_at: now, updated_at: now };
}

export function newId(): string {
  return randomUUID();
}
