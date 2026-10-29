"use client";
import { Checkbox } from "@/components/ui/checkbox";
import { overrideNotice, pendingProposalInbox, previewHasPendingProposals, proposalQueue } from "./proposal-inbox";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon, CheckIcon, CircleXIcon, MessageSquareIcon, PlayIcon, Undo2Icon } from "lucide-react";
import { toast } from "sonner";
import { Menu } from "@base-ui/react/menu";
import { proposalInboxFeed } from "./proposal-inbox-feed";
import type { PollDelivery } from "./shared-poll";

import { blocksReviewShortcut } from "./playback-keyboard";

import { Button } from "@/components/ui/button";
import { Keycap } from "@/components/ui/keycap";
import { useKeyboardShortcuts } from "@/components/studio/hooks/useKeyboardShortcuts";
import { ariaKeyShortcut, bindingMatches, OFF, shortcutLabel, type KeyBinding } from "@/lib/keyboard-shortcuts";
import { ProposalAdjustments } from "./ProposalAdjustments";
import { ProposalAdvancedAdjustments } from "./ProposalAdvancedAdjustments";
import { ProposalMotionControls } from "./ProposalMotionControls";
import { InspectorDisclosure } from "./InspectorHierarchy";
import { proposalAdjustmentFocusTime, proposalClipWindow } from "./proposal-adjustment-focus";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useShownPreviewLoading } from "./proposal-preview-loading";
import { controlValueEquals, isSupportedProposalControl } from "@/lib/agent/proposal-controls";
import { MOTION_RENDER_FIELD } from "@/lib/hyperframes/motion-media";
import { ProposalMotionGroup } from "./ProposalMotionGroup";
import { ProposalAgentAsk } from "./ProposalAgentAsk";
import type { AgentAsk } from "@/components/desktop/ProjectReviewDock";
import { motionGroups, motionItemTitle } from "./proposal-motion-groups";
import {
  compatibleProposalSelection,
  toggleProposalSelection,
  selectionForPlayedOption,
  firstProposalSelection,
  selectionWithNewProposalDefaults,
} from "@/components/studio/timeline/proposal-selection";
import type {
  MutationHistoryDescriptors,
  PendingRequest,
  ProposalInboxResponse,
  ProposalNumericOverride,
  ProposalListEntry,
  ProposalMotionItem,
  ProposalOptionReview,
  TimelineClient,
} from "@/components/studio/timeline/timeline-client";
import { instantPreviewProps, type InstantPreviewProp } from "./proposal-preview-props";
import { ProposalSpeechEdits } from "./ProposalSpeechEdits";

/**
 * Review surface for agent proposals: pending proposals with their derived
 * per-option review rows (verb, target, before → after — computed server-side
 * from the patch, never authored by the agent), a pure in-player preview, and
 * approve/reject. Approval re-checks the timeline revision server-side and
 * 409s when stale, so nothing here can clobber newer edits.
 */

export type ProposalOptionSelection = {
  proposalId: string;
  optionId: string;
  optionLabel: string;
  overrides?: ProposalNumericOverride[];
};

export type ProposalPreviewSelection = ProposalOptionSelection & {
  /** When present, preview these independent edits on one composite draft. */
  batch?: ProposalOptionSelection[];
  /** Refresh the shown frame without restarting playback. */
  preserveFrame?: boolean;
  /** Paused frame for direct visual feedback while tuning an animated control. */
  focusTimeSeconds?: number;
  /** The card whose Replay played the batch: playback starts at its change, not the earliest ticked one. */
  focus?: ProposalOptionReview;
};

type Detail = {
  status: string;
  stale: boolean;
  stale_reason?: string | null;
  review: ProposalOptionReview[];
};

type DetailLoadError = {
  message: string;
};

// Keep audit/source identity in the proposal record, outside creator controls.

/** A step of a wave that is not open: its own outlined row, so each step reads as one item. */
const WAVE_STEP_ROW = "flex min-h-9 w-full items-center gap-2.5 rounded-[var(--edge-surface)] border border-[var(--edge-outline)] bg-[var(--glass-control)] px-3 text-sm";
const REVIEW_ACTION_SIZE = "h-8 rounded-md px-3 text-xs leading-none";
// Secondary review actions are a quiet fill with no outline; Apply is the one
// filled primary action per card (open space over lines, editor-visual-system.md).
const REVIEW_SECONDARY_ACTION = `${REVIEW_ACTION_SIZE} bg-[var(--glass-field)] text-[var(--ink)] hover:bg-[var(--chrome-raised)] hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)]`;
// Apply is green in every palette, matching the selection checkbox.
const REVIEW_APPLY_ACTION = "bg-[var(--proposal-apply)] text-[var(--proposal-apply-ink)] hover:bg-[var(--proposal-apply-hover)]";
const REVIEW_ROW_ACTION = "gap-1.5 px-2 @max-[22rem]:gap-1 @max-[22rem]:px-1.5";
/** Icons stay with their key at any width; on a narrow card the words are what give way. */
const REVIEW_ROW_ICON = "shrink-0";
// Key hints always show: they are how a reviewer works fast. When the row runs short of room the
// words go first, secondary actions before Apply, and the name stays in the tooltip and label.
const REVIEW_ACTION_WORD = "hidden @[19rem]:inline";
/** While previewing, Original joins the row, so the secondary words need more room. */
const REVIEW_ACTION_WORD_CROWDED = "hidden @[27rem]:inline";
/** Apply keeps its word longest, as the one primary action. */
const REVIEW_PRIMARY_WORD = "hidden @[16rem]:inline";
const REVIEW_KEY_HINT = "inline-flex";
const keyInTitle = (binding: KeyBinding) => binding === OFF ? "" : ` (${shortcutLabel(binding)})`;
const keyHint = (binding: KeyBinding) => binding === OFF ? null : <span className={REVIEW_KEY_HINT}><Keycap>{shortcutLabel(binding)}</Keycap></span>;

function overrideKey(proposalId: string, optionId: string, override: Omit<ProposalNumericOverride, "value">) {
  return `${proposalId}:${optionId}:${override.operation_index}:${override.target}:${override.field}`;
}

function isAdjustable(change: ProposalOptionReview["rows"][number]["changes"][number]) {
  return isSupportedProposalControl(change.target, change.field, change.after_value);
}


/** "Edit", "Choose one · 3 options" or a wave step: what kind of card this is. */
function ProposalKindChip({ isChoice, label, inline = false }: { isChoice: boolean; label: string; inline?: boolean }) {
  return <span className={`${inline ? "mr-2 inline-block align-[1px] " : ""}rounded-[var(--edge-pill)] px-2 py-0.5 text-[12px] font-semibold ${isChoice
    ? "bg-violet-300/10 text-[var(--proposal-accent)]"
    : "bg-emerald-300/10 text-[var(--proposal-positive)]"}`}>{label}</span>;
}

/** The one clip an option changes, named beside the option instead of as a header above its dials. */
function singleSubject(option: ProposalOptionReview): string | null {
  const rows = (option.adjustment_rows ?? option.rows).filter((row) => !row.element_id.startsWith("timing:"));
  const names = new Set(rows.map((row) => row.element_label));
  return names.size === 1 ? [...names][0]! : null;
}
export function ProposalsPanel({
  client,
  activePreview,
  previewLoading: preparingPreview = false,
  compareShowingLive = false,
  onToggleComparison,
  onPlayOptions,
  onTuneOption,
  onInstantPreview,
  onPlayBatch,
  onCheckedChange,
  onExitPreview,
  onApplied,
  onRejected,
  onCountsChange,
  onClose,
  onRespond,
  onAskAgent,
  embedded = false,
  reviewActive = true,
  refreshToken = 0,
}: {
  client: TimelineClient;
  activePreview: ProposalPreviewSelection | null;
  previewLoading?: boolean;
  compareShowingLive?: boolean;
  onToggleComparison?: () => void;
  /**
   * Audition-style: play each option's draft through its affected window, in
   * order. The card plays one option at a time (its Preview button or R).
   */
  onPlayOptions: (selections: ProposalPreviewSelection[]) => void;
  /** `batch` is every ticked edit when the tuned one is ticked beside others, so the preview keeps them all. */
  onTuneOption: (selection: ProposalOptionSelection & { focusTimeSeconds?: number; batch?: ProposalOptionSelection[] }) => void;
  /** Show picture dials on the paused draft on every drag sample, before the full preview is derived. */
  onInstantPreview?: (proposalId: string, props: InstantPreviewProp[]) => void;
  /** Preview independent proposals together, at their real timeline positions; `focus` starts at that card's change. */
  onPlayBatch: (selections: ProposalOptionSelection[], focus?: ProposalOptionReview) => void;
  /** The checked edits, so the timeline can show what they would add before any preview. */
  onCheckedChange?: (selections: ProposalOptionSelection[]) => void;
  onExitPreview: () => void;
  /**
   * An option was approved and written; the host should reload the timeline
   * and, when snapshot descriptors are present, record a visible Undo entry.
   */
  onApplied: (history?: MutationHistoryDescriptors | null, count?: number, label?: string) => void;
  /** A card was rejected; the host records the returned snapshots as a visible Undo entry. */
  onRejected?: (history: MutationHistoryDescriptors | null | undefined, label: string) => void;
  /** Keep the shared Review badges in sync after local proposal actions. */
  onCountsChange?: (actionable: number, stale: number) => void;
  onClose?: () => void;
  onRespond?: (proposal: { id: string; summary: string }) => void;
  /** Sends Repair and Draft asks into the visible chat; without it they are copied for the creator's own agent chat. */
  onAskAgent?: (ask: AgentAsk) => void;
  /** Shelf-tab mode: fill the host container, no own border/close chrome. */
  embedded?: boolean;
  /** True while this review surface is the visible destination. Newly loaded
   * proposals default to their first option; manual unchecks survive refresh. */
  reviewActive?: boolean;
  /** Lets a containing drawer put Refresh in its own header. */
  refreshToken?: number;
}) {
  const shortcuts = useKeyboardShortcuts();
  // Tuning re-prepares the shown preview on every dial value; Replay stays put unless one runs long.
  // A batch preview is keyed by its members, so a different batch counts as a first preparation.
  const previewKey = activePreview
    ? `${activePreview.proposalId}:${activePreview.optionId}${activePreview.batch?.length ? `:${activePreview.batch.map(item => `${item.proposalId}/${item.optionId}`).join(",")}` : ""}`
    : null;
  const previewLoading = useShownPreviewLoading(preparingPreview, previewKey);
  const [entries, setEntries] = useState<ProposalListEntry[] | null>(null);
  const [historyEntries, setHistoryEntries] = useState<ProposalListEntry[]>([]);
  /** The wave step the creator opened, per wave id; otherwise the first open step shows. */
  const [openedSteps, setOpenedSteps] = useState<Record<string, readonly string[]>>({});
  const [closedSteps, setClosedSteps] = useState<Record<string, readonly string[]>>({});
  // The card the creator opened last takes the keys, so a card shows R, A and X the moment it opens.
  const [focusedProposalId, setFocusedProposalId] = useState<string | null>(null);
  const openStep = (waveId: string, proposalId: string) => {
    setFocusedProposalId(proposalId);
    setOpenedSteps((current) => ({ ...current, [waveId]: [...(current[waveId] ?? []).filter((id) => id !== proposalId), proposalId] }));
    setClosedSteps((current) => ({ ...current, [waveId]: (current[waveId] ?? []).filter((id) => id !== proposalId) }));
  };
  const closeStep = (waveId: string, proposalId: string) => {
    setFocusedProposalId((current) => current === proposalId ? null : current);
    setOpenedSteps((current) => ({ ...current, [waveId]: (current[waveId] ?? []).filter((id) => id !== proposalId) }));
    setClosedSteps((current) => ({ ...current, [waveId]: [...(current[waveId] ?? []).filter((id) => id !== proposalId), proposalId] }));
  };
  const [historyOpen, setHistoryOpen] = useState(false);
  /** Recorded requests with no draft yet; shown so they are never invisible, never counted as reviewable. */
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, DetailLoadError>>({});
  const [busy, setBusy] = useState<string | null>(null);
  /** Proposal options whose motion graphic is re-rendering after a control change. */
  const [motionRendering, setMotionRendering] = useState<Record<string, boolean>>({});
  // Choose-one cards start with every option folded so the options read as a short list.
  const [openOptions, setOpenOptions] = useState<Record<string, boolean>>({});
  const [numericOverrides, setNumericOverrides] = useState<Record<string, ProposalNumericOverride["value"]>>({});
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const seenProposalIds = useRef(new Set<string>());
  const hydratedTuning = useRef(new Set<string>());
  const tuningSaveQueue = useRef(Promise.resolve());
  const dirtyTuning = useRef(new Map<string, { proposalId: string; option: ProposalOptionReview }>());

  useEffect(() => {
    if (entries === null) return;
    const inbox = pendingProposalInbox(entries);
    onCountsChange?.(inbox.actionable, inbox.stale);
  }, [entries, onCountsChange]);

  useEffect(() => {
    if (entries !== null && activePreview && !previewHasPendingProposals(entries, activePreview)) {
      onExitPreview();
    }
  }, [activePreview, entries, onExitPreview]);

  const overridesFor = useCallback((proposalId: string, option: ProposalOptionReview): ProposalNumericOverride[] => (
    (option.adjustment_rows ?? option.rows).flatMap((row) => row.changes.flatMap((change) => {
      // Server-side proposalNumericOverridesSchema accepts exactly these
      // targets; offering an override on any other row would 400 on approve.
      if ((change.target !== "create_transition" && change.target !== "create_audio" && change.target !== "create_visual" && change.target !== "create_text" && change.target !== "create_shape" && change.target !== "opening_sequence_edit" && change.target !== "source_range_cut" && change.target !== "speed_change" && change.target !== "patch" && change.target !== "props" && change.target !== "timing_control" && change.target !== "block") || !isAdjustable(change)) return [];
      const key = overrideKey(proposalId, option.option_id, {
        operation_index: change.operation_index,
        target: change.target,
        field: change.field,
      });
      const value = numericOverrides[key];
      return value !== undefined && !controlValueEquals(value, change.after_value)
        ? [{ operation_index: change.operation_index, target: change.target, field: change.field, value }]
        : [];
    })).concat((option.motion_items ?? []).flatMap((item) => {
      // A creator's composition control change swaps the clip to its re-render.
      const binding = { operation_index: item.operation_index, target: item.target ?? "create_visual", field: MOTION_RENDER_FIELD };
      const value = numericOverrides[overrideKey(proposalId, option.option_id, binding)];
      return item.kind === "composition" && typeof value === "string" && value !== item.source_url ? [{ ...binding, value }] : [];
    }))
  ), [numericOverrides]);

  const [tuningTarget, setTuningTarget] = useState<{ proposalId: string; option: ProposalOptionReview; focusTimeSeconds?: number } | null>(null);
  const tuneCallbackRef = useRef(onTuneOption);
  // The ticked edits, read when a tuning settles (declared below with the rest of the selection state).
  const selectedBatchRef = useRef<ProposalOptionSelection[]>([]);
  tuneCallbackRef.current = onTuneOption;
  useEffect(() => {
    if (!tuningTarget) return;
    // Waits for a drag to settle: each save re-prepares the preview server-side (about a second),
    // so firing on every pause restarted that work and left the preview loading.
    const timer = window.setTimeout(() => {
      for (const target of dirtyTuning.current.values()) {
        const overrides = overridesFor(target.proposalId, target.option);
        tuningSaveQueue.current = tuningSaveQueue.current.then(() => client.saveProposalTuning(
          target.proposalId, target.option.option_id, overrides,
        )).then(() => undefined).catch(() => { toast.error("Adjustments could not be saved. Keep this review open and try again."); });
      }
      dirtyTuning.current.clear();
      const ticked = selectedBatchRef.current;
      const tunedTicked = ticked.some((item) => item.proposalId === tuningTarget.proposalId && item.optionId === tuningTarget.option.option_id);
      tuneCallbackRef.current({
        proposalId: tuningTarget.proposalId,
        optionId: tuningTarget.option.option_id,
        optionLabel: tuningTarget.option.label,
        overrides: overridesFor(tuningTarget.proposalId, tuningTarget.option),
        focusTimeSeconds: tuningTarget.focusTimeSeconds,
        ...(tunedTicked && ticked.length > 1 ? { batch: ticked } : {}),
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [numericOverrides, tuningTarget, overridesFor, client]);

  const feed = useMemo(() => proposalInboxFeed(client), [client]);
  const feedRef = useRef(feed);
  feedRef.current = feed;
  // Results from requests issued before a local decision (approve/reject/restore)
  // must not restore resolved cards; only a later request may update review state.
  const staleThrough = useRef(0);
  const invalidateReview = useCallback(() => {
    staleThrough.current = feedRef.current.issuedRequestId();
  }, []);

  const applyInbox = useCallback((inboxResponse: ProposalInboxResponse, delivery: PollDelivery) => {
    if (delivery.requestId <= staleThrough.current) return;
    const inbox = pendingProposalInbox(inboxResponse.proposals);
    setEntries(inbox.entries);
    const pendingIds = new Set(inbox.entries.map(entry => entry.proposal_id));
    setHistoryEntries(inboxResponse.proposals.filter(entry => !pendingIds.has(entry.proposal_id)));
    setPendingRequests(inboxResponse.pending_requests ?? []);
    const loaded: Record<string, Detail> = {};
    const errors: Record<string, DetailLoadError> = {};
    const restored: Record<string, ProposalNumericOverride["value"]> = {};
    for (const entry of inbox.entries) {
      const detail = inboxResponse.details?.[entry.proposal_id];
      if (!detail && entry.wave && (entry.wave.waiting_for.length || entry.wave.blocked_by.length)) continue;
      if (!detail || "error" in detail) {
        errors[entry.proposal_id] = { message: detail?.error ?? "Failed to load proposal details" };
        continue;
      }
      loaded[entry.proposal_id] = { status: detail.status, stale: detail.stale, stale_reason: detail.stale_reason, review: detail.review };
      if (hydratedTuning.current.has(entry.proposal_id)) continue;
      hydratedTuning.current.add(entry.proposal_id);
      for (const [optionId, overrides] of Object.entries(detail.tuning ?? {})) {
        for (const override of overrides) restored[overrideKey(entry.proposal_id, optionId, override)] = override.value;
      }
    }
    if (Object.keys(restored).length) setNumericOverrides(current => ({ ...restored, ...current }));
    setDetails(loaded);
    setDetailErrors(errors);
  }, []);

  /** Explicit reload (mount, Refresh, after a decision). Interval polling is the shared feed's job. */
  const refresh = useCallback(async ({ silent = false, joinInFlight = false }: { silent?: boolean; joinInFlight?: boolean } = {}): Promise<void> => {
    try {
      const inboxResponse = await feed.refresh({ force: !silent, joinInFlight });
      if (!silent && inboxResponse) {
        const pending = pendingProposalInbox(inboxResponse.proposals).entries;
        if (pending.some(entry => !entry.wave?.waiting_for.length && !entry.wave?.blocked_by.length
          && (!inboxResponse.details?.[entry.proposal_id] || "error" in inboxResponse.details[entry.proposal_id]))) {
          toast.error("A proposal is visible, but its review details could not be loaded. Reopen Proposals to try again.");
        }
      }
    } catch (error) {
      if (!silent) {
        toast.error(error instanceof Error ? error.message : "Failed to load proposals");
        setEntries([]);
        setDetails({});
        setDetailErrors({});
      }
    }
  }, [feed]);

  useEffect(() => {
    // One shared, visibility-aware conditional poll; an unchanged inbox is a 304.
    const unsubscribe = feed.subscribe(applyInbox);
    void refresh({ joinInFlight: true });
    return unsubscribe;
  }, [feed, applyInbox, refresh]);

  useEffect(() => {
    if (refreshToken > 0) void refresh();
  }, [refresh, refreshToken]);

  useEffect(() => {
    const refreshAfterProjectRestore = () => {
      invalidateReview();
      void refresh();
    };
    window.addEventListener("timeline-editor:project-restored", refreshAfterProjectRestore);
    return () => {
      window.removeEventListener("timeline-editor:project-restored", refreshAfterProjectRestore);
    };
  }, [invalidateReview, refresh]);

  // Default each newly loaded proposal once. Polling must not undo manual choices.
  useEffect(() => {
    if (!entries || Object.keys(details).length === 0) return;
    const previouslySeen = new Set(seenProposalIds.current);
    for (const entry of entries) {
      if (details[entry.proposal_id]?.review.length) seenProposalIds.current.add(entry.proposal_id);
    }
    setSelectedOptions(current => selectionWithNewProposalDefaults(entries, details, current, previouslySeen));
  }, [details, entries]);

  const selectedBatch = useMemo<ProposalOptionSelection[]>(() => (entries ?? []).flatMap((entry) => {
    const optionId = selectedOptions?.[entry.proposal_id];
    const option = details[entry.proposal_id]?.review.find((candidate) => candidate.option_id === optionId);
    if (!option || entry.stale || details[entry.proposal_id]?.stale) return [];
    return [{
      proposalId: entry.proposal_id,
      optionId: option.option_id,
      optionLabel: option.label,
      overrides: overridesFor(entry.proposal_id, option),
    }];
  }), [details, entries, overridesFor, selectedOptions]);
  selectedBatchRef.current = selectedBatch;

  useEffect(() => { onCheckedChange?.(selectedBatch); }, [onCheckedChange, selectedBatch]);

  // A preview of the ticked edits follows the ticks: ticking or unticking re-previews the new selection
  // (closing the drawer ends it; the ticked edits stay on the timeline as pending clips), and unticking the last edit goes back to live.
  // A preview of one card on its own ends when the ticks change.
  const followSelection = useRef(false);
  const selectionKey = (selections: readonly ProposalOptionSelection[]) => selections.map((selection) => `${selection.proposalId}:${selection.optionId}`).join("|");
  // Ticking another card while one previews adds it to the preview; unticking leaves the preview as it was.
  const beforeTickChange = useCallback((adding = false) => {
    if (!activePreview) return;
    if (adding) followSelection.current = true;
    else if (!followSelection.current) onExitPreview();
  }, [activePreview, onExitPreview]);

  // Ticking an option of a choose-one card shows it in the player at once, in place: the playhead stays
  // and playback carries on, so the creator compares grades or looks by ticking (or 1–9) alone.
  // Only when it is the sole ticked card; ticking alongside other cards keeps the batch behaviour.
  const showTickedChoice = useCallback((next: Record<string, string> | null | undefined, proposalId: string) => {
    const options = details[proposalId]?.review;
    const option = options?.find((candidate) => candidate.option_id === next?.[proposalId]);
    if (!option || options!.length < 2 || Object.keys(next ?? {}).length !== 1) return false;
    followSelection.current = false;
    onTuneOption({ proposalId, optionId: option.option_id, optionLabel: option.label, overrides: overridesFor(proposalId, option) });
    return true;
  }, [details, onTuneOption, overridesFor]);

  const selectAllDefaults = useCallback(() => {
    const selection = firstProposalSelection(entries ?? [], details);
    if (activePreview) onExitPreview();
    setSelectedOptions(selection);
    const actionableCount = (entries ?? []).filter((entry) => (
      !entry.stale && !details[entry.proposal_id]?.stale
    )).length;
    const excludedCount = Math.max(0, actionableCount - Object.keys(selection).length);
  }, [activePreview, details, entries, onExitPreview]);

  // After a decision, the next card comes up for review on its own (see the effect below playKeyboardOption).
  const advanceAfterDecision = useRef(false);

  const approve = useCallback(async (proposalId: string, option: ProposalOptionReview) => {
    setBusy(proposalId);
    try {
      const result = await client.approveProposal(proposalId, option.option_id, overridesFor(proposalId, option));
      invalidateReview();
      setEntries((current) => current?.filter(entry => entry.proposal_id !== proposalId) ?? null);
      setSelectedOptions((current) => Object.fromEntries(Object.entries(current ?? {}).filter(([id]) => id !== proposalId)));
      onExitPreview();
      onApplied(result.history, 1, option.label);
      advanceAfterDecision.current = true;
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Approve failed");
    } finally {
      setBusy(null);
    }
  }, [client, invalidateReview, onApplied, onExitPreview, overridesFor, refresh]);

  const approveSelected = useCallback(async () => {
    if (selectedBatch.length === 0) return;
    const selectedIds = new Set(selectedBatch.map((selection) => selection.proposalId));
    setBusy("__batch__");
    try {
      const result = await client.approveProposalBatch(selectedBatch.map((selection) => ({
        proposal_id: selection.proposalId,
        option_id: selection.optionId,
        ...(selection.overrides?.length ? { overrides: selection.overrides } : {}),
      })));
      invalidateReview();
      setEntries((current) => current?.filter(entry => !selectedIds.has(entry.proposal_id)) ?? null);
      onExitPreview();
      setSelectedOptions((current) => Object.fromEntries(
        Object.entries(current ?? {}).filter(([proposalId]) => !selectedIds.has(proposalId)),
      ));
      onApplied(result.history, result.approved_count, `${result.approved_count} selected edits`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Batch approval failed");
    } finally {
      setBusy(null);
    }
  }, [client, invalidateReview, onApplied, onExitPreview, refresh, selectedBatch]);

  const reject = useCallback(async (proposalId: string) => {
    setBusy(proposalId);
    try {
      // No reason typed: a reason is recorded as the creator's feedback, so never send a placeholder.
      const result = await client.rejectProposal(proposalId);
      invalidateReview();
      const summary = entries?.find(entry => entry.proposal_id === proposalId)?.summary;
      onRejected?.(result.history, summary ?? "proposal");
      setEntries((current) => current?.filter(entry => entry.proposal_id !== proposalId) ?? null);
      if (activePreview?.proposalId === proposalId) onExitPreview();
      advanceAfterDecision.current = true;
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reject failed");
    } finally {
      setBusy(null);
    }
  }, [activePreview, client, entries, invalidateReview, onExitPreview, onRejected, refresh]);

  const queue = useMemo(() => proposalQueue(entries ?? [], historyEntries, openedSteps, closedSteps), [closedSteps, entries, historyEntries, openedSteps]);
  const actionableEntries = useMemo(
    () => {
      const result = queue.filter((item) => item.mode === "card").map((item) => item.entry)
        .filter((entry) => !entry.stale && !details[entry.proposal_id]?.stale);
      return result;
    },
    [details, queue],
  );
  const reviewOptions = useMemo(() => actionableEntries.flatMap((entry) => (
    (details[entry.proposal_id]?.review ?? []).map((option) => ({
      proposalId: entry.proposal_id,
      option,
    }))
  )), [actionableEntries, details]);
  const keyboardOptions = useMemo(() => reviewOptions.slice(0, 9), [reviewOptions]);
  // The one option R, A and X act on, and whose buttons show those keys: the option being previewed,
  // else the card the creator opened last, else the topmost selected option on screen, else the only
  // option on screen. Steps of a wave that are not open do not count, so an open step always has its
  // keys, and several open cards never share them.
  const keyTarget = useMemo<{ proposalId: string; optionId: string } | null>(() => {
    if (activePreview && !activePreview.batch?.length) return { proposalId: activePreview.proposalId, optionId: activePreview.optionId };
    const visible = new Set(actionableEntries.map((entry) => entry.proposal_id));
    if (focusedProposalId && visible.has(focusedProposalId)) {
      const options = details[focusedProposalId]?.review ?? [];
      const optionId = selectedOptions?.[focusedProposalId] ?? (options.find((option) => option.recommended) ?? options[0])?.option_id;
      if (optionId) return { proposalId: focusedProposalId, optionId };
    }
    const selectedHere = actionableEntries.flatMap((entry) => selectedBatch.filter((selection) => selection.proposalId === entry.proposal_id && visible.has(selection.proposalId)));
    if (selectedHere.length >= 1) return selectedHere[0]!;
    if (selectedHere.length === 0 && reviewOptions.length === 1) return { proposalId: reviewOptions[0]!.proposalId, optionId: reviewOptions[0]!.option.option_id };
    return null;
  }, [actionableEntries, activePreview, details, focusedProposalId, reviewOptions, selectedBatch, selectedOptions]);
  const isKeyTarget = (proposalId: string, optionId: string) => keyTarget?.proposalId === proposalId && keyTarget.optionId === optionId;

  const checkKeyboardOption = useCallback((proposalId: string, option: ProposalOptionReview) => {
    setSelectedOptions((current) => compatibleProposalSelection(
      entries ?? [],
      details,
      { ...(current ?? {}), [proposalId]: option.option_id },
      proposalId,
    ));
    if (activePreview && (activePreview.proposalId !== proposalId || activePreview.optionId !== option.option_id)) {
      onExitPreview();
    }
  }, [activePreview, details, entries, onExitPreview]);

  // Playing never changes what is ticked here: a card the creator unticked stays unticked while it plays.
  // An option's own Preview/Replay button on a choose-one card selects that option first (selectionForPlayedOption).
  const playKeyboardOption = useCallback((proposalId: string, option: ProposalOptionReview) => {
    followSelection.current = false;
    onPlayOptions([{
      proposalId,
      optionId: option.option_id,
      optionLabel: option.label,
      overrides: overridesFor(proposalId, option),
    }]);
  }, [onPlayOptions, overridesFor]);

  // Applying or rejecting a card brings the next one up: it is checked, scrolled into view and plays,
  // so the creator can work down the queue without stopping between cards.
  useEffect(() => {
    if (!advanceAfterDecision.current || busy != null || !reviewActive) return;
    const next = actionableEntries[0];
    if (!next) { advanceAfterDecision.current = false; return; }
    const options = details[next.proposal_id]?.review;
    if (!options?.length) return;
    advanceAfterDecision.current = false;
    const option = options.find((candidate) => candidate.recommended) ?? options[0]!;
    document.querySelector(`[data-proposal-card="${CSS.escape(next.proposal_id)}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    checkKeyboardOption(next.proposal_id, option);
    playKeyboardOption(next.proposal_id, option);
  }, [actionableEntries, busy, checkKeyboardOption, details, playKeyboardOption, reviewActive]);

  const playSelection = useCallback((selections: ProposalOptionSelection[], focus?: ProposalOptionReview) => {
    if (selections.length === 1) onPlayOptions([selections[0]!]);
    else if (selections.length > 1) onPlayBatch(selections, focus);
  }, [onPlayBatch, onPlayOptions]);
  // A card's own Replay (or R on it) plays the ticked set from that card's change.
  const playSelected = useCallback((focus?: ProposalOptionReview) => {
    if (selectedBatch.length === 0) return;
    followSelection.current = true;
    playSelection(selectedBatch, focus);
  }, [playSelection, selectedBatch]);
  // Re-preview when the ticks change under a preview that follows them.
  const activeKey = activePreview ? selectionKey(activePreview.batch?.length ? activePreview.batch : [activePreview]) : "";
  const tickedKey = selectionKey(selectedBatch);
  useEffect(() => {
    if (!followSelection.current) return;
    if (!activePreview) { followSelection.current = false; return; }
    if (activeKey === tickedKey) return;
    if (selectedBatch.length === 0) { followSelection.current = false; onExitPreview(); return; }
    playSelection(selectedBatch);
  // Only a change of which edits are ticked re-previews; tuning re-prepares through its own path.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickedKey]);

  // R plays what is ticked; a single card plays alone only when nothing else is ticked or it is the one ticked.
  // The key hints read this too, so R shows on whichever Preview button it presses.
  const replayCard = useMemo(() => {
    const targetTicked = keyTarget && selectedBatch.some((selection) => selection.proposalId === keyTarget.proposalId && selection.optionId === keyTarget.optionId);
    // A card previewing on its own replays with R, like its Replay button.
    const previewingTargetAlone = Boolean(keyTarget && activePreview && !activePreview.batch?.length
      && activePreview.proposalId === keyTarget.proposalId && activePreview.optionId === keyTarget.optionId);
    // Once another card is ticked beside it, R plays the ticked set, not the card alone.
    const aloneAllowed = previewingTargetAlone && !(targetTicked && selectedBatch.length > 1);
    return (keyTarget && (!activePreview || aloneAllowed) && (selectedBatch.length === 0 || (targetTicked && selectedBatch.length === 1) || aloneAllowed)
      && reviewOptions.find(({ proposalId, option }) => proposalId === keyTarget.proposalId && option.option_id === keyTarget.optionId)) || null;
  }, [activePreview, keyTarget, reviewOptions, selectedBatch]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (blocksReviewShortcut(event.target) || event.isComposing || event.defaultPrevented || event.repeat) return;

      if (reviewActive && busy == null && /^[1-9]$/.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const selection = keyboardOptions[Number(event.key) - 1];
        if (!selection) return;
        event.preventDefault();
        const adding = selectedOptions?.[selection.proposalId] !== selection.option.option_id;
        const next = toggleProposalSelection(entries ?? [], details, selectedOptions, selection.proposalId, selection.option.option_id);
        if (!(adding && showTickedChoice(next, selection.proposalId))) beforeTickChange(adding);
        setSelectedOptions(next);
        return;
      }

      // Shift+A applies every ticked edit, like the batch bar's Apply button (creator direction).
      if (bindingMatches(event, shortcuts.applyAll) && reviewActive && busy == null && selectedBatch.length > 0) {
        event.preventDefault();
        void approveSelected();
        return;
      }

      // A applies one edit: the card being previewed, else the only selected one. A mistaken
      // Apply or Reject is undone with Undo (creator direction).
      if (bindingMatches(event, shortcuts.apply) && reviewActive && busy == null) {
        const match = keyTarget && reviewOptions.find(({ proposalId, option }) => (
          proposalId === keyTarget.proposalId && option.option_id === keyTarget.optionId
        ));
        if (!match) return;
        event.preventDefault();
        void approve(match.proposalId, match.option);
        return;
      }

      if (bindingMatches(event, shortcuts.reject) && reviewActive && keyTarget && busy == null) {
        const entry = actionableEntries.find((candidate) => candidate.proposal_id === keyTarget.proposalId);
        if (!entry || !details[entry.proposal_id]?.review.some((option) => option.option_id === keyTarget.optionId)) return;
        event.preventDefault();
        void reject(entry.proposal_id);
        return;
      }

      if (!bindingMatches(event, shortcuts.reviewPlay) || !reviewActive || busy != null) return;
      if (replayCard) { event.preventDefault(); playKeyboardOption(replayCard.proposalId, replayCard.option); return; }
      if (selectedBatch.length === 0) return;
      event.preventDefault();
      const keyTargetTicked = keyTarget && selectedBatch.some((selection) => selection.proposalId === keyTarget.proposalId && selection.optionId === keyTarget.optionId);
      playSelected(keyTargetTicked ? details[keyTarget.proposalId]?.review.find((option) => option.option_id === keyTarget.optionId) : undefined);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [actionableEntries, activePreview, approve, approveSelected, beforeTickChange, busy, details, entries, keyTarget, keyboardOptions, onExitPreview, playKeyboardOption, playSelected, reject, replayCard, reviewActive, reviewOptions, selectedBatch, selectedOptions, showTickedChoice, shortcuts.apply, shortcuts.applyAll, shortcuts.reject, shortcuts.reviewPlay]);


  return (
    <div className={embedded
      ? "proposal-panel flex h-full w-full flex-col overflow-hidden text-[15px] leading-6 text-[var(--ink-secondary)]"
      : "proposal-panel flex h-full w-[24rem] flex-col overflow-hidden rounded-lg border border-[var(--edge-outline)] bg-[var(--chrome-deep)] text-[15px] leading-6 text-[var(--ink-secondary)]"}
    >
      {!embedded && (
        <div className="flex items-center gap-2 px-4 pb-1 pt-3">
          <span className="text-base font-semibold text-[var(--ink)]">Proposals</span>
          <div className="ml-auto flex items-center gap-2">

            {onClose && (
              <Button variant="ghost" size="sm" className="text-[var(--color-text-secondary)] hover:bg-[var(--proposal-surface)] hover:text-[var(--ink)]" onClick={onClose} aria-label="Close proposals panel">
                Close
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {entries === null && <p>Loading proposals…</p>}
        {entries?.length === 0 && (
          <p>Nothing to review</p>
        )}
        {/* The batch bar previews or applies every checked edit together, so it shows whenever two or more are checked,
            including steps whose cards are closed. One edit is reviewed from its own card. */}
        {selectedBatch.length > 1 && (
          <div role="group" aria-label="Review selection" className="sticky top-0 z-20 flex items-center gap-2 rounded-md bg-[var(--chrome-panel)] p-2 shadow-md">
            <Menu.Root>
              <Menu.Trigger
                render={<Button variant="ghost" size="sm" />}
                className={`${REVIEW_SECONDARY_ACTION} min-w-0 flex-1 px-2`}
                aria-label={`Selection options, ${selectedBatch.length} edits selected`}
                disabled={busy != null}
              >
                <span className="truncate">{selectedBatch.length} selected</span>
                <ChevronDownIcon data-icon="inline-end" />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner sideOffset={6} align="start" className="editor-chrome isolate z-(--layer-popover)">
                  <Menu.Popup className="min-w-60 rounded-lg border border-[var(--edge-outline)] bg-[var(--chrome-panel)] p-1 text-sm text-[var(--ink)] shadow-xl outline-none">
                    <Menu.Item onClick={selectAllDefaults} className="cursor-pointer rounded-md px-3 py-2 outline-none data-[highlighted]:bg-[var(--chrome-raised)]">
                      Select compatible edits
                    </Menu.Item>
                    <Menu.Item disabled={selectedBatch.length === 0} onClick={() => { followSelection.current = false; if (activePreview) onExitPreview(); setSelectedOptions({}); }} className="cursor-pointer rounded-md px-3 py-2 outline-none data-[highlighted]:bg-[var(--chrome-raised)] data-[disabled]:opacity-50">
                      Clear selection
                    </Menu.Item>
                    {activePreview && <Menu.Item onClick={onExitPreview} className="cursor-pointer rounded-md px-3 py-2 outline-none data-[highlighted]:bg-[var(--chrome-raised)]">Back to live edit</Menu.Item>}
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
            <Button
              size="sm"
              variant="ghost"
              disabled={selectedBatch.length === 0 || busy != null || previewLoading}
              aria-busy={previewLoading}
              aria-label={activePreview ? "Replay selected edits" : "Preview selected edits"}
              aria-keyshortcuts={replayCard ? undefined : ariaKeyShortcut(shortcuts.reviewPlay)}
              title={`Play selected${replayCard ? "" : keyInTitle(shortcuts.reviewPlay)}`}
              className={`${REVIEW_SECONDARY_ACTION} px-2 aria-busy:disabled:opacity-100`}
              onClick={() => playSelected()}
            >
              {/* Loading replaces only the icon, so the word stays readable. */}
              <span className="grid w-3.5 items-center justify-items-center [&>*]:col-start-1 [&>*]:row-start-1">
                <PlayIcon aria-hidden="true" className={previewLoading ? "invisible" : ""} />
                <span role="status" className={`inline-flex items-center justify-center overflow-visible ${previewLoading ? "" : "invisible"}`}>
                  <span className="sr-only">Loading preview</span><LoadingDots className="font-sans" />
                </span>
              </span>
              {activePreview ? "Replay" : "Preview"}
              {keyHint(shortcuts.reviewPlay)}
            </Button>
            <Button
              size="sm"
              disabled={selectedBatch.length === 0 || busy != null}
              className={`${REVIEW_ACTION_SIZE} px-2 ${REVIEW_APPLY_ACTION}`}
              onClick={() => void approveSelected()}
              aria-label={`Apply ${selectedBatch.length} ${selectedBatch.length === 1 ? "edit" : "edits"}`}
              aria-keyshortcuts={ariaKeyShortcut(shortcuts.applyAll)}
              title={`Apply all ${selectedBatch.length} selected${keyInTitle(shortcuts.applyAll)}`}
            >
              <CheckIcon data-icon="inline-start" />
              {busy === "__batch__" ? "Applying…" : `Apply ${selectedBatch.length}`}
              {keyHint(shortcuts.applyAll)}
            </Button>
          </div>
        )}
        {queue.map(({ entry, mode }) => {
          if (mode !== "card" && entry.wave) {
            const wave = entry.wave;
            return (
              mode === "done" || mode === "waiting" ? (
                <div key={entry.proposal_id} data-wave-step={mode} className={`${WAVE_STEP_ROW} text-[var(--ink-muted)]`}>
                  <span className="w-4 shrink-0 text-center tabular-nums">{wave.step}</span>
                  <span className="min-w-0 flex-1 truncate">{wave.title}</span>
                  {mode === "done" ? <span className="inline-flex items-center gap-1"><CheckIcon aria-hidden="true" className="size-3.5" /> Done</span>
                    : <span>After step {wave.waiting_for.join(" & ")}</span>}
                </div>
              ) : (
                // The checkbox shows and changes whether this step is checked for Apply; the rest of the row opens it.
                <div key={entry.proposal_id} data-wave-step={mode}
                  className={`${WAVE_STEP_ROW} gap-0 pl-0 pr-0 text-[var(--ink-secondary)] focus-within:outline-2 focus-within:outline-[var(--chrome-focus-ring)] hover:bg-[var(--chrome-raised)] hover:text-[var(--ink)]`}>
                  {(() => {
                    const options = details[entry.proposal_id]?.review ?? [];
                    const optionId = selectedOptions?.[entry.proposal_id] ?? (options.find((option) => option.recommended) ?? options[0])?.option_id;
                    return <label className="flex shrink-0 cursor-pointer items-center self-stretch pl-3 pr-2.5">
                      <Checkbox tone="apply" className="self-center"
                        aria-label={`Select step ${wave.step}: ${wave.title} for review`}
                        checked={selectedOptions?.[entry.proposal_id] != null}
                        disabled={!optionId || busy != null}
                        onCheckedChange={() => { if (!optionId) return; beforeTickChange(selectedOptions?.[entry.proposal_id] == null); setSelectedOptions((current) => toggleProposalSelection(entries ?? [], details, current, entry.proposal_id, optionId)); }} />
                    </label>;
                  })()}
                  <button type="button" aria-label={`Open step ${wave.step}: ${wave.title}`}
                    className="flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-2.5 self-stretch pr-3 text-left outline-none"
                    onClick={() => { if (activePreview) onExitPreview(); openStep(wave.id, entry.proposal_id); }}>
                    <span className="w-4 shrink-0 text-center tabular-nums text-[var(--ink-muted)]">{wave.step}</span>
                    <span className="min-w-0 flex-1 truncate">{wave.title}</span>
                    <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-[var(--ink-muted)]" />
                  </button>
                </div>
              )
            );
          }
          const detail = details[entry.proposal_id];
          const detailError = detailErrors[entry.proposal_id];
          const isStale = entry.stale || detail?.stale;
          const optionCount = detail?.review.length ?? entry.option_count;
          const isChoice = optionCount > 1;
          return (
            <section
              key={entry.proposal_id}
              data-proposal-card={entry.proposal_id}
              className={isStale
                ? "rounded-[var(--edge-surface)] border border-amber-400/25 bg-amber-400/[0.06] p-3"
                : "rounded-[var(--edge-surface)] border border-[var(--edge-outline)] bg-[var(--proposal-surface)] p-3"}
            >
              <header className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  {/* The kind chip leads the title on its own line only when actions share the row; otherwise it sits inline. */}
                  {onRespond || entry.wave ? <div className="mb-1.5 flex items-center gap-2">
                    <ProposalKindChip isChoice={isChoice} label={entry.wave ? `Step ${entry.wave.step} of ${entry.wave.total} · ${entry.wave.title}` : isChoice ? `Choose one · ${optionCount} options` : "Edit"} />
                    {onRespond && <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs text-[var(--ink-secondary)] hover:text-[var(--ink)]" onClick={() => onRespond({ id: entry.proposal_id, summary: entry.summary })}>
                      <MessageSquareIcon data-icon="inline-start" />Respond in chat
                    </Button>}
                    {/* A step of a wave folds back to its row; the queue keeps it there until it is opened again. */}
                    {entry.wave && <Button variant="ghost" size="icon-sm" className={`${onRespond ? "" : "ml-auto "}size-7 text-[var(--ink-muted)] hover:text-[var(--ink)]`}
                      aria-label={`Close step ${entry.wave.step}: ${entry.wave.title}`} title="Close"
                      onClick={() => { const wave = entry.wave!; if (activePreview?.proposalId === entry.proposal_id) onExitPreview(); closeStep(wave.id, entry.proposal_id); }}>
                      <ChevronUpIcon aria-hidden="true" />
                    </Button>}
                  </div> : null}
                  <p className="font-medium text-[var(--ink)]">
                    {onRespond || entry.wave ? null : <ProposalKindChip isChoice={isChoice} label={isChoice ? `Choose one · ${optionCount} options` : "Edit"} inline />}
                    {entry.summary}
                  </p>
                  {entry.brief && <p className="mt-1 whitespace-normal break-words text-[14px] leading-6">{entry.brief}</p>}
                </div>
              </header>

              {isStale && <div role="status" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-[var(--proposal-warning)]">
                <span className="min-w-0 flex-1"><strong>No longer applies.</strong> {entry.stale_reason ?? detail?.stale_reason ?? "The timeline changed under this edit."}</span>
                <ProposalAgentAsk kind="repair" targetId={entry.proposal_id} label={entry.summary} recorded={entry.agent_request} client={client} onAskAgent={onAskAgent} />
              </div>}
              {!isStale && entry.overrides?.length ? <p role="status" className="mt-3 text-[13px] text-[var(--proposal-warning)]">
                {overrideNotice(entry.overrides, detail?.review ?? [])}
              </p> : null}
              {detailError && (
                <p className="mt-3 rounded border border-amber-400/25 bg-amber-400/10 px-2.5 py-2 text-[13px] text-[var(--proposal-warning)]">
                  Review details could not be loaded: {detailError.message}. <Button variant="ghost" size="sm" onClick={() => void refresh()}>Retry</Button>
                </p>
              )}

              {detail?.review.map((option) => {
                const previewing = (activePreview?.proposalId === entry.proposal_id
                  && activePreview.optionId === option.option_id)
                  || Boolean(activePreview?.batch?.some(selection => selection.proposalId === entry.proposal_id && selection.optionId === option.option_id));
                // Matches the A key: the card being previewed, else the only selected one.
                const applyKey = isKeyTarget(entry.proposal_id, option.option_id);
                // Key hints show on every card (creator direction); the shortcut itself is announced only where
                // pressing the key does what this button does: replaying the card, or the ticked set it belongs to.
                const replaysThis = applyKey && (replayCard
                  ? replayCard.proposalId === entry.proposal_id && replayCard.option.option_id === option.option_id
                  : selectedBatch.length > 1 && selectedOptions?.[entry.proposal_id] === option.option_id);
                const keyboardOptionIndex = keyboardOptions.findIndex(({ proposalId, option: candidate }) => (
                  proposalId === entry.proposal_id && candidate.option_id === option.option_id
                ));
                const keyboardShortcut = keyboardOptionIndex >= 0 ? String(keyboardOptionIndex + 1) : null;
                const tune = (binding: Omit<ProposalNumericOverride, "value">, value: ProposalNumericOverride["value"] | undefined) => {
                  dirtyTuning.current.set(`${entry.proposal_id}:${option.option_id}`, { proposalId: entry.proposal_id, option });
                  const currentTime = (field: string) => {
                    const change = (option.adjustment_rows ?? option.rows).flatMap(row => row.changes)
                      .find(change => change.field === field && typeof change.after_value === "number");
                    if (!change) return undefined;
                    if (field === binding.field && typeof value === "number") return value;
                    if (field === binding.field && value === undefined) return change.after_value as number;
                    const override = numericOverrides[overrideKey(entry.proposal_id, option.option_id, {
                      operation_index: change.operation_index, target: "props", field,
                    })];
                    return typeof override === "number" ? override : change.after_value as number;
                  };
                  const shownValue = value ?? (option.adjustment_rows ?? option.rows).flatMap(row => row.changes)
                    .find(change => change.operation_index === binding.operation_index && change.target === binding.target && change.field === binding.field)?.after_value;
                  if (typeof shownValue === "number") onInstantPreview?.(entry.proposal_id, instantPreviewProps(option.rows, [{...binding, value: shownValue}]));
                  setTuningTarget({proposalId: entry.proposal_id, option,
                    focusTimeSeconds: proposalAdjustmentFocusTime(option, binding.field, currentTime, binding.operation_index)});
                  const key = overrideKey(entry.proposal_id, option.option_id, binding);
                  setNumericOverrides(current => {
                    const next = {...current};
                    if (value === undefined) delete next[key]; else next[key] = value;
                    return next;
                  });
                };
                // A choose-one option folds its dials under its name; Preview and Choose stay on every row. One-option cards stay open.
                const optionKey = `${entry.proposal_id}:${option.option_id}`;
                const optionOpen = !isChoice || Boolean(openOptions[optionKey]);
                const optionBodyId = `proposal-option-${optionKey.replace(/[^A-Za-z0-9_-]/g, "-")}`;
                const optionTitle = <>
                      <span className="min-w-0 break-words font-medium text-[var(--ink)]">
                        {/* The star marks the recommended choice, so it only means something when there is a choice. */}
                        {isChoice && option.recommended ? "★ " : ""}{option.label}
                      </span>
                      {singleSubject(option) ? <span className="min-w-0 truncate text-xs text-[var(--ink-muted)]">{singleSubject(option)}</span> : null}
                      {(option.playback_range ?? option.preview_range) ? (() => {
                        const range = (option.playback_range ?? option.preview_range)!;
                        const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
                        return <span className="text-xs tabular-nums text-[var(--ink-muted)]" aria-label={`Preview range ${clock(range.start_seconds)} to ${clock(range.end_seconds)}`}>{clock(range.start_seconds)}–{clock(range.end_seconds)}</span>;
                      })() : null}
                </>;
                return (
                  <div key={option.option_id} className="mt-2.5">
                    {/* Checkbox and key sit in boxes one label line tall, so every item centers on the label's first line. */}
                    <div className="flex items-start gap-2 leading-6">
                      <span className="flex h-6 shrink-0 items-center" hidden={Boolean(isStale)}>
                      <Checkbox
                        tone="apply"
                        aria-label={`Select ${option.label} for review`}
                        aria-keyshortcuts={keyboardShortcut ?? undefined}
                        checked={!isStale && selectedOptions?.[entry.proposal_id] === option.option_id}
                        disabled={isStale || busy != null}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            const next = compatibleProposalSelection(
                              entries ?? [],
                              details,
                              { ...(selectedOptions ?? {}), [entry.proposal_id]: option.option_id },
                              entry.proposal_id,
                            );
                            if (!showTickedChoice(next, entry.proposal_id)) beforeTickChange(true);
                            setSelectedOptions(next);
                            return;
                          }
                          beforeTickChange(false);
                          setSelectedOptions((current) => {
                            if (current?.[entry.proposal_id] !== option.option_id) return current;
                            const next = { ...current };
                            delete next[entry.proposal_id];
                            return next;
                          });
                        }}
                      />
                      </span>
                      {keyboardShortcut ? <span className="flex h-6 shrink-0 items-center" aria-hidden="true"><Keycap className="ml-0">{keyboardShortcut}</Keycap></span> : null}
                      {isChoice ? (
                        <button type="button" aria-expanded={optionOpen} aria-controls={optionBodyId}
                          onClick={() => setOpenOptions(current => ({ ...current, [optionKey]: !optionOpen }))}
                          className="flex min-w-0 flex-1 items-start gap-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)]">
                          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">{optionTitle}</span>
                          <span className="flex h-6 shrink-0 items-center text-[var(--ink-secondary)]" aria-hidden="true">
                            <ChevronRightIcon className={`size-3.5 transition-transform ${optionOpen ? "rotate-90" : ""}`} />
                          </span>
                        </button>
                      ) : <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">{optionTitle}</span>}
                    </div>
                    {/* Folding keeps the dials mounted, so tuned values and live dials stay intact. */}
                    <div id={optionBodyId} hidden={!optionOpen}>
                    {option.speech_edits?.length ? <ProposalSpeechEdits edits={option.speech_edits} /> : null}
                    {/* Labels and derived controls describe the choice; raw option notes remain in the audit record. */}
                    {/* Timing and graphic dials share one Advanced adjustments section after the main dials. */}
                    {!isStale && <ProposalAdvancedAdjustments>
                    <ProposalAdjustments key={`${entry.proposal_id}:${option.option_id}`} option={option}
                      valueFor={binding => numericOverrides[overrideKey(entry.proposal_id, option.option_id, binding)]}
                      onChange={tune}
                    />
                    {motionGroups(option.motion_items).map((items) => {
                      const busyKey = `${entry.proposal_id}:${option.option_id}`;
                      const onBusyChange = (rendering: boolean) => setMotionRendering((current) => (
                        Boolean(current[busyKey]) === rendering ? current : { ...current, [busyKey]: rendering }
                      ));
                      const member = (item: ProposalMotionItem) => {
                        const binding = { operation_index: item.operation_index, target: item.target ?? "create_visual", field: MOTION_RENDER_FIELD };
                        const rendered = numericOverrides[overrideKey(entry.proposal_id, option.option_id, binding)];
                        return { item, binding, title: motionItemTitle(option, item), renderedUrl: typeof rendered === "string" ? rendered : undefined };
                      };
                      // One graphic used by several clips on this card: shared settings once, differences per clip.
                      if (items.length > 1) {
                        return (
                          <ProposalMotionGroup
                            key={`${option.option_id}:${items[0]!.id}:group`}
                            members={items.map((item) => { const m = member(item); return { item, title: m.title ?? item.id, renderedUrl: m.renderedUrl, onRendered: (sourceUrl: string | undefined) => tune(m.binding, sourceUrl) }; })}
                            proposalId={entry.proposal_id}
                            client={client}
                            disabled={busy != null}
                            onBusyChange={onBusyChange}
                            mainControls={option.motion_main_controls}
                          />
                        );
                      }
                      const { item, binding, title, renderedUrl } = member(items[0]!);
                      return (
                        <ProposalMotionControls
                          key={`${option.option_id}:${item.id}:${item.operation_index}`}
                          item={item}
                          title={title}
                          proposalId={entry.proposal_id}
                          client={client}
                          disabled={busy != null}
                          renderedUrl={renderedUrl}
                          onRendered={(sourceUrl) => tune(binding, sourceUrl)}
                          onBusyChange={onBusyChange}
                          mainControls={option.motion_main_controls}
                          liveWindow={proposalClipWindow(option, item.operation_index)}
                        />
                      );
                    })}
                    </ProposalAdvancedAdjustments>}
                    </div>
                    <div className="@container mt-3 flex min-w-0 flex-nowrap items-center gap-1.5 @max-[22rem]:gap-1">
                      {/* A card that no longer applies offers no preview or apply, only Repair and Reject. */}
                      {!isStale && <span className="flex min-w-0 items-center gap-1.5 @max-[22rem]:gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className={`${REVIEW_SECONDARY_ACTION} ${REVIEW_ROW_ACTION} aria-busy:disabled:opacity-100`}
                        onClick={() => {
                          if (selectedBatch.length > 1 && selectedOptions?.[entry.proposal_id] === option.option_id) { playSelected(option); return; }
                          // Previewing an alternative selects it, so what plays is what A applies (creator direction).
                          setSelectedOptions(current => selectionForPlayedOption(entries ?? [], details, current, entry.proposal_id, option.option_id));
                          playKeyboardOption(entry.proposal_id, option);
                        }}
                        disabled={isStale || (previewLoading && previewing)}
                        aria-busy={previewLoading && previewing}
                        aria-label={`${previewing ? "Replay" : "Preview"} ${option.label}`}
                        title={`${previewing ? "Replay" : "Preview"}${replaysThis ? keyInTitle(shortcuts.reviewPlay) : ""}`}
                        aria-keyshortcuts={replaysThis ? ariaKeyShortcut(shortcuts.reviewPlay) : undefined}
                      >
                        {/* The loading dots take the icon's cell, beside the key hint, so loading never changes the width. */}
                        <span className={`grid w-3.5 items-center justify-items-center [&>*]:col-start-1 [&>*]:row-start-1 ${REVIEW_ROW_ICON}`}>
                          {/* Replaying is playing again, so it keeps the play icon; the word and tooltip say Replay. */}
                          <PlayIcon aria-hidden="true" className={previewLoading && previewing ? "invisible" : ""} />
                          <span role="status" className={`inline-flex items-center justify-center overflow-visible ${previewLoading && previewing ? "" : "invisible"}`}>
                            <span className="sr-only">Loading</span><LoadingDots className="font-sans" />
                          </span>
                        </span>
                        <span className={previewing ? REVIEW_ACTION_WORD_CROWDED : REVIEW_ACTION_WORD}>{previewing ? "Replay" : "Preview"}</span>
                        {keyHint(shortcuts.reviewPlay)}
                      </Button>
                      {previewing ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className={compareShowingLive ? `${REVIEW_ACTION_SIZE} ${REVIEW_ROW_ACTION} bg-[var(--chrome-selected-bg)] text-[var(--ink)] ring-1 ring-[var(--chrome-selected-ring)] hover:bg-[var(--chrome-selected-bg)]` : `${REVIEW_SECONDARY_ACTION} ${REVIEW_ROW_ACTION}`}
                          onClick={onToggleComparison ?? onExitPreview}
                          aria-pressed={compareShowingLive}
                          aria-label={`Show original${keyInTitle(shortcuts.compareOriginal)}`}
                          title={`Show original${keyInTitle(shortcuts.compareOriginal)}`}
                          aria-keyshortcuts={ariaKeyShortcut(shortcuts.compareOriginal)}
                        >
                          <Undo2Icon aria-hidden="true" className={REVIEW_ROW_ICON} />
                          <span className={REVIEW_ACTION_WORD_CROWDED}>Original</span>
                          {keyHint(shortcuts.compareOriginal)}
                        </Button>
                      ) : null}
                      </span>}
                      {/* Deciding actions stay together on the right: Reject, then the one primary Apply. Both pairs share one line. */}
                      <span className="ml-auto flex items-center gap-1.5 @max-[22rem]:gap-1">
                      {optionCount === 1 ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy != null}
                          className={`${REVIEW_SECONDARY_ACTION} ${REVIEW_ROW_ACTION} shrink-0 text-[var(--editor-destructive-ink)] hover:bg-red-500/10 hover:text-[var(--editor-destructive-ink)]`}
                          onClick={() => void reject(entry.proposal_id)}
                          aria-label="Reject proposal"
                          aria-keyshortcuts={applyKey ? ariaKeyShortcut(shortcuts.reject) : undefined}
                          title={`Reject this proposal${applyKey ? keyInTitle(shortcuts.reject) : ""}`}
                        >
                          <CircleXIcon aria-hidden="true" className={REVIEW_ROW_ICON} />
                          <span className={previewing ? REVIEW_ACTION_WORD_CROWDED : REVIEW_ACTION_WORD}>Reject</span>
                          {keyHint(shortcuts.reject)}
                        </Button>
                      ) : null}
                      {!isStale && <>
                      <Button
                        size="sm"
                        disabled={busy != null || isStale || Boolean(motionRendering[`${entry.proposal_id}:${option.option_id}`])}
                        className={`${REVIEW_ACTION_SIZE} ${REVIEW_ROW_ACTION} ${REVIEW_APPLY_ACTION}`}
                        onClick={() => void approve(entry.proposal_id, option)}
                        aria-label={isChoice ? `Choose and apply ${option.label}` : `Apply ${option.label}`}
                        aria-keyshortcuts={applyKey ? ariaKeyShortcut(shortcuts.apply) : undefined}
                        title={isStale ? "Out of date — ask the agent to propose again" : `${isChoice ? "Choose and apply" : "Apply"}${applyKey ? keyInTitle(shortcuts.apply) : ""}`}
                      >
                        <CheckIcon aria-hidden="true" className={REVIEW_ROW_ICON} />
                        <span className={REVIEW_PRIMARY_WORD}>{isChoice ? "Choose" : "Apply"}</span>
                        {keyHint(shortcuts.apply)}
                      </Button>
                      </>}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Options are compared one at a time with each option's own Preview; there is no Play all. */}
              {optionCount > 1 && <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy != null}
                  className={`${REVIEW_SECONDARY_ACTION} ${REVIEW_ROW_ACTION} ml-auto shrink-0 text-[var(--editor-destructive-ink)] hover:bg-red-500/10 hover:text-[var(--editor-destructive-ink)]`}
                  onClick={() => void reject(entry.proposal_id)}
                  aria-label="Reject proposal"
                  aria-keyshortcuts={keyTarget?.proposalId === entry.proposal_id ? ariaKeyShortcut(shortcuts.reject) : undefined}
                  title={`Reject this proposal${keyTarget?.proposalId === entry.proposal_id ? keyInTitle(shortcuts.reject) : ""}`}
                >
                  <CircleXIcon aria-hidden="true" />
                  <span className={REVIEW_ACTION_WORD}>Reject</span>
                  {keyHint(shortcuts.reject)}
                </Button>
              </div>}
            </section>
          );
        })}
        {pendingRequests.map(request => (
          <div key={request.id} data-wave-step="request" className="flex min-h-9 flex-wrap items-center gap-2.5 px-3 py-1 text-sm text-[var(--ink-secondary)]">
            <span className="shrink-0 text-[var(--ink-muted)]">Up next</span>
            {/* A brief from Home reads in full, with the media it brought, until its first cut arrives. */}
            {request.media ? <span className="min-w-0 flex-1 basis-full whitespace-pre-wrap text-[var(--ink)]">{request.direction}</span>
              : <span className="min-w-0 flex-1 truncate" title={request.direction}>{request.direction}</span>}
            {request.media && request.media.length > 0 && <ul className="chat-selection-pills chat-upload-pills basis-full" aria-label="Media in the Library">
              {request.media.map((name, index) => <li key={`${name}:${index}`} className="chat-selection-pill" title={name}><span className="chat-selection-pill-label">{name}</span></li>)}
            </ul>}
            <ProposalAgentAsk kind="draft" targetId={request.id} label={request.direction} recorded={request.agent_request} client={client} onAskAgent={onAskAgent} />
            {onRespond && <Button size="icon-sm" variant="ghost" className="shrink-0 text-[var(--ink-secondary)] hover:text-[var(--ink)]"
              aria-label={`Respond in chat: ${request.direction}`} title="Respond in chat"
              onClick={() => onRespond({ id: request.id, summary: `Not drafted yet: ${request.direction}` })}>
              <MessageSquareIcon aria-hidden="true" />
            </Button>}
          </div>
        ))}
        {historyEntries.length > 0 && <InspectorDisclosure title={`Proposal history (${historyEntries.length})`} open={historyOpen} onOpenChange={setHistoryOpen}>
          <div className="space-y-2">
            {historyEntries.map(entry => <div key={entry.proposal_id} className="text-sm">
              <span className="font-medium">{entry.replaced_by_approved_proposal_id ? "Replaced" : entry.replaced_by_pending_proposal_id ? "Earlier draft" : entry.status === "approved" ? "Applied" : "Rejected"}</span>
              <p className="text-[var(--ink-secondary)]">{entry.summary}</p>
            </div>)}
          </div>
        </InspectorDisclosure>}
      </div>
    </div>
  );
}
