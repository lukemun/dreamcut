"use client";
import { overrideNotice, pendingProposalInbox, previewHasPendingProposals, proposalQueue } from "./proposal-inbox";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, CheckIcon, Columns2Icon, MessageSquareIcon, PlayIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Menu } from "@base-ui/react/menu";
import { proposalInboxFeed } from "./proposal-inbox-feed";
import type { PollDelivery } from "./shared-poll";

import { blocksReviewShortcut } from "./playback-keyboard";

import { Button } from "@/components/ui/button";
import { ProposalAdjustments } from "./ProposalAdjustments";
import { ProposalAdvancedAdjustments } from "./ProposalAdvancedAdjustments";
import { ProposalMotionControls } from "./ProposalMotionControls";
import { InspectorDisclosure } from "./InspectorHierarchy";
import { proposalAdjustmentFocusTime } from "./proposal-adjustment-focus";
import { LoadingDots } from "@/components/ui/loading-dots";
import { isSupportedProposalControl } from "@/lib/agent/proposal-controls";
import { MOTION_RENDER_FIELD } from "@/lib/hyperframes/motion-media";
import { ProposalMotionGroup } from "./ProposalMotionGroup";
import { ProposalAgentAsk } from "./ProposalAgentAsk";
import type { AgentAsk } from "@/components/desktop/ProjectReviewDock";
import { motionGroups, motionItemTitle } from "./proposal-motion-groups";
import {
  compatibleProposalSelection,
  toggleProposalSelection,
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

const REVIEW_ACTION_SIZE = "h-8 rounded-md px-3 text-xs leading-none";
// Secondary review actions are a quiet fill with no outline; Apply is the one
// filled primary action per card (open space over lines, editor-visual-system.md).
const REVIEW_SECONDARY_ACTION = `${REVIEW_ACTION_SIZE} bg-[var(--glass-field)] text-[var(--ink)] hover:bg-[var(--chrome-raised)] hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)]`;
// Apply is green in every palette, matching the selection checkbox.
const REVIEW_APPLY_ACTION = "bg-[var(--proposal-apply)] text-[var(--proposal-apply-ink)] hover:bg-[var(--proposal-apply-hover)]";
// Each action reads as a word; its key sits after it as a quiet keycap.
const REVIEW_KEY = "ml-0.5 inline-flex h-4 min-w-4 items-center justify-center self-center rounded-[3px] bg-current/10 px-1 font-mono text-[10px] leading-none opacity-70";

function overrideKey(proposalId: string, optionId: string, override: Omit<ProposalNumericOverride, "value">) {
  return `${proposalId}:${optionId}:${override.operation_index}:${override.target}:${override.field}`;
}

function isAdjustable(change: ProposalOptionReview["rows"][number]["changes"][number]) {
  return isSupportedProposalControl(change.target, change.field, change.after_value);
}

export function ProposalsPanel({
  client,
  activePreview,
  previewLoading = false,
  compareShowingLive = false,
  onToggleComparison,
  onPlayOptions,
  onTuneOption,
  onInstantPreview,
  onPlayBatch,
  onExitPreview,
  onApplied,
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
   * order. One selection = click-to-play; several = Play all.
   */
  onPlayOptions: (selections: ProposalPreviewSelection[]) => void;
  onTuneOption: (selection: ProposalOptionSelection & { focusTimeSeconds?: number }) => void;
  /** Show picture dials on the paused draft on every drag sample, before the full preview is derived. */
  onInstantPreview?: (proposalId: string, props: InstantPreviewProp[]) => void;
  /** Preview independent proposals together, at their real timeline positions. */
  onPlayBatch: (selections: ProposalOptionSelection[]) => void;
  onExitPreview: () => void;
  /**
   * An option was approved and written; the host should reload the timeline
   * and, when snapshot descriptors are present, record a visible Undo entry.
   */
  onApplied: (history?: MutationHistoryDescriptors | null, count?: number, label?: string) => void;
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
  const [entries, setEntries] = useState<ProposalListEntry[] | null>(null);
  const [historyEntries, setHistoryEntries] = useState<ProposalListEntry[]>([]);
  /** The wave step the creator opened, per wave id; otherwise the first open step shows. */
  const [openedSteps, setOpenedSteps] = useState<Record<string, string>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  /** Recorded requests with no draft yet; shown so they are never invisible, never counted as reviewable. */
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, DetailLoadError>>({});
  const [busy, setBusy] = useState<string | null>(null);
  /** Proposal options whose motion graphic is re-rendering after a control change. */
  const [motionRendering, setMotionRendering] = useState<Record<string, boolean>>({});
  const [numericOverrides, setNumericOverrides] = useState<Record<string, number | string>>({});
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
      if ((change.target !== "create_transition" && change.target !== "create_audio" && change.target !== "create_visual" && change.target !== "create_text" && change.target !== "opening_sequence_edit" && change.target !== "source_range_cut" && change.target !== "patch" && change.target !== "props" && change.target !== "timing_control") || !isAdjustable(change)) return [];
      const key = overrideKey(proposalId, option.option_id, {
        operation_index: change.operation_index,
        target: change.target,
        field: change.field,
      });
      const value = numericOverrides[key];
      return value !== undefined && value !== change.after_value
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
  tuneCallbackRef.current = onTuneOption;
  useEffect(() => {
    if (!tuningTarget) return;
    const timer = window.setTimeout(() => {
      for (const target of dirtyTuning.current.values()) {
        const overrides = overridesFor(target.proposalId, target.option);
        tuningSaveQueue.current = tuningSaveQueue.current.then(() => client.saveProposalTuning(
          target.proposalId, target.option.option_id, overrides,
        )).then(() => undefined).catch(() => { toast.error("Adjustments could not be saved. Keep this review open and try again."); });
      }
      dirtyTuning.current.clear();
      tuneCallbackRef.current({
        proposalId: tuningTarget.proposalId,
        optionId: tuningTarget.option.option_id,
        optionLabel: tuningTarget.option.label,
        overrides: overridesFor(tuningTarget.proposalId, tuningTarget.option),
        focusTimeSeconds: tuningTarget.focusTimeSeconds,
      });
    }, 120);
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
    const restored: Record<string, number | string> = {};
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
      await client.rejectProposal(proposalId, "Rejected in the editor");
      invalidateReview();
      setEntries((current) => current?.filter(entry => entry.proposal_id !== proposalId) ?? null);
      if (activePreview?.proposalId === proposalId) onExitPreview();
      advanceAfterDecision.current = true;
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reject failed");
    } finally {
      setBusy(null);
    }
  }, [activePreview, client, invalidateReview, onExitPreview, refresh]);

  const queue = useMemo(() => proposalQueue(entries ?? [], historyEntries, openedSteps), [entries, historyEntries, openedSteps]);
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

  const playKeyboardOption = useCallback((proposalId: string, option: ProposalOptionReview) => {
    checkKeyboardOption(proposalId, option);
    onPlayOptions([{
      proposalId,
      optionId: option.option_id,
      optionLabel: option.label,
      overrides: overridesFor(proposalId, option),
    }]);
  }, [checkKeyboardOption, onPlayOptions, overridesFor]);

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
    playKeyboardOption(next.proposal_id, option);
  }, [actionableEntries, busy, details, playKeyboardOption, reviewActive]);

  const playSelected = useCallback(() => {
    if (selectedBatch.length === 1) {
      const selected = selectedBatch[0]!;
      const match = reviewOptions.find(({ proposalId, option }) => (
        proposalId === selected.proposalId && option.option_id === selected.optionId
      ));
      if (match) playKeyboardOption(match.proposalId, match.option);
    } else if (selectedBatch.length > 1) {
      onPlayBatch(selectedBatch);
    }
  }, [onPlayBatch, playKeyboardOption, reviewOptions, selectedBatch]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (blocksReviewShortcut(event.target) || event.isComposing || event.defaultPrevented
        || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;

      if (reviewActive && busy == null && /^[1-9]$/.test(event.key)) {
        const selection = keyboardOptions[Number(event.key) - 1];
        if (!selection) return;
        event.preventDefault();
        if (activePreview) onExitPreview();
        setSelectedOptions((current) => toggleProposalSelection(
          entries ?? [], details, current, selection.proposalId, selection.option.option_id,
        ));
        return;
      }

      // A applies one edit: the card being previewed, else the only selected one. Several selected
      // edits apply only from the batch bar's Apply button, never from a key meant for one card.
      if (event.key.toLowerCase() === "a" && reviewActive && busy == null) {
        const target = activePreview && !activePreview.batch?.length
          ? { proposalId: activePreview.proposalId, optionId: activePreview.optionId }
          : selectedBatch.length === 1 ? selectedBatch[0]! : null;
        const match = target && reviewOptions.find(({ proposalId, option }) => (
          proposalId === target.proposalId && option.option_id === target.optionId
        ));
        if (!match) return;
        event.preventDefault();
        void approve(match.proposalId, match.option);
        return;
      }

      if (event.key.toLowerCase() === "x" && reviewActive && activePreview && !activePreview.batch?.length && busy == null) {
        const entry = actionableEntries.find((candidate) => candidate.proposal_id === activePreview.proposalId);
        if (!entry || !details[entry.proposal_id]?.review.some((option) => option.option_id === activePreview.optionId)) return;
        event.preventDefault();
        void reject(entry.proposal_id);
        return;
      }

      if (event.key.toLowerCase() !== "r" || !reviewActive || selectedBatch.length === 0 || busy != null) return;
      event.preventDefault();
      playSelected();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [actionableEntries, activePreview, approve, approveSelected, busy, details, entries, keyboardOptions, onExitPreview, playSelected, reject, reviewActive, reviewOptions, selectedBatch]);


  return (
    <div className={embedded
      ? "proposal-panel flex h-full w-full flex-col overflow-hidden text-[15px] leading-6 text-[var(--ink-secondary)]"
      : "proposal-panel flex h-full w-[24rem] flex-col overflow-hidden rounded-lg border border-[var(--chrome-line-strong)] bg-[var(--chrome-deep)] text-[15px] leading-6 text-[var(--ink-secondary)]"}
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
        {/* One option is reviewed from its own card; the batch bar appears only when there is a choice to combine. */}
        {reviewOptions.length > 1 && (
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
                <Menu.Positioner sideOffset={6} align="start" className="editor-chrome z-[1200]">
                  <Menu.Popup className="min-w-60 rounded-lg border border-[var(--chrome-line-strong)] bg-[var(--chrome-panel)] p-1 text-sm text-[var(--ink)] shadow-xl outline-none">
                    <Menu.Item onClick={selectAllDefaults} className="cursor-pointer rounded-md px-3 py-2 outline-none data-[highlighted]:bg-[var(--chrome-raised)]">
                      Select compatible edits
                    </Menu.Item>
                    <Menu.Item disabled={selectedBatch.length === 0} onClick={() => { if (activePreview) onExitPreview(); setSelectedOptions({}); }} className="cursor-pointer rounded-md px-3 py-2 outline-none data-[highlighted]:bg-[var(--chrome-raised)] data-[disabled]:opacity-50">
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
              title="Play selected"
              className={`${REVIEW_SECONDARY_ACTION} px-2`}
              onClick={playSelected}
            >
              {previewLoading
                ? <span role="status" aria-label="Loading preview" className="inline-flex items-center gap-1.5"><LoadingDots /></span>
                : activePreview
                ? <><RotateCcwIcon data-icon="inline-start" /> Replay</>
                : <><PlayIcon data-icon="inline-start" /> Preview</>}
            </Button>
            <Button
              size="sm"
              disabled={selectedBatch.length === 0 || busy != null}
              className={`${REVIEW_ACTION_SIZE} px-2 ${REVIEW_APPLY_ACTION}`}
              onClick={() => void approveSelected()}
              aria-label={`Apply ${selectedBatch.length} ${selectedBatch.length === 1 ? "edit" : "edits"}`}
              title={`Apply all ${selectedBatch.length} selected`}
            >
              <CheckIcon data-icon="inline-start" />
              {busy === "__batch__" ? "Applying…" : `Apply ${selectedBatch.length}`}
            </Button>
          </div>
        )}
        {queue.map(({ entry, mode }) => {
          if (mode !== "card" && entry.wave) {
            const wave = entry.wave;
            return (
              <div key={entry.proposal_id} data-wave-step={mode} className="flex min-h-9 items-center gap-2.5 px-3 text-sm text-[var(--ink-secondary)]">
                <span className="w-4 shrink-0 text-center tabular-nums text-[var(--ink-muted)]">{wave.step}</span>
                <span className={`min-w-0 flex-1 truncate ${mode === "done" ? "text-[var(--ink-muted)]" : ""}`}>{wave.title}</span>
                {mode === "done" ? <span className="inline-flex items-center gap-1 text-[var(--ink-muted)]"><CheckIcon aria-hidden="true" className="size-3.5" /> Done</span>
                  : mode === "waiting" ? <span className="text-[var(--ink-muted)]">After step {wave.waiting_for.join(" & ")}</span>
                  : <Button size="sm" variant="ghost" className={`${REVIEW_SECONDARY_ACTION} px-2.5`} aria-label={`Open step ${wave.step}: ${wave.title}`}
                      onClick={() => { if (activePreview) onExitPreview(); setOpenedSteps((current) => ({ ...current, [wave.id]: entry.proposal_id })); }}>Open</Button>}
              </div>
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
                ? "rounded-md border border-amber-400/25 bg-amber-400/[0.06] p-3"
                : "rounded-md bg-[var(--proposal-surface)] p-3"}
            >
              <header className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className={isChoice
                      ? "rounded-full bg-violet-300/10 px-2 py-0.5 text-[12px] font-semibold text-[var(--proposal-accent)]"
                      : "rounded-full bg-emerald-300/10 px-2 py-0.5 text-[12px] font-semibold text-[var(--proposal-positive)]"}
                    >
                      {entry.wave ? `Step ${entry.wave.step} of ${entry.wave.total} · ${entry.wave.title}` : isChoice ? `Choose one · ${optionCount} options` : "Edit"}
                    </span>
                    {onRespond && <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs text-[var(--ink-secondary)] hover:text-[var(--ink)]" onClick={() => onRespond({ id: entry.proposal_id, summary: entry.summary })}>
                      <MessageSquareIcon data-icon="inline-start" />Respond in chat
                    </Button>}
                  </div>
                  <p className="font-medium text-[var(--ink)]">{entry.summary}</p>
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
                const applyKey = activePreview && !activePreview.batch?.length
                  ? activePreview.proposalId === entry.proposal_id && activePreview.optionId === option.option_id
                  : selectedBatch.length === 1 && selectedBatch[0]?.proposalId === entry.proposal_id && selectedBatch[0]?.optionId === option.option_id;
                const keyboardOptionIndex = keyboardOptions.findIndex(({ proposalId, option: candidate }) => (
                  proposalId === entry.proposal_id && candidate.option_id === option.option_id
                ));
                const keyboardShortcut = keyboardOptionIndex >= 0 ? String(keyboardOptionIndex + 1) : null;
                const tune = (binding: Omit<ProposalNumericOverride, "value">, value: number | string | undefined) => {
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
                    focusTimeSeconds: proposalAdjustmentFocusTime(option, binding.field, currentTime)});
                  const key = overrideKey(entry.proposal_id, option.option_id, binding);
                  setNumericOverrides(current => {
                    const next = {...current};
                    if (value === undefined) delete next[key]; else next[key] = value;
                    return next;
                  });
                };
                return (
                  <div key={option.option_id} className="mt-4">
                    <div className="flex flex-wrap items-start gap-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${option.label} for review`}
                        aria-keyshortcuts={keyboardShortcut ?? undefined}
                        checked={!isStale && selectedOptions?.[entry.proposal_id] === option.option_id}
                        disabled={isStale || busy != null}
                        hidden={Boolean(isStale)}
                        className="mt-1 size-4 accent-emerald-500"
                        onChange={(event) => { if (activePreview) onExitPreview(); setSelectedOptions((current) => {
                          const next = { ...(current ?? {}) };
                          if (event.target.checked) {
                            next[entry.proposal_id] = option.option_id;
                            const compatible = compatibleProposalSelection(
                              entries ?? [],
                              details,
                              next,
                              entry.proposal_id,
                            );
                            const replaced = Object.keys(next).length - Object.keys(compatible).length;
                            return compatible;
                          } else if (next[entry.proposal_id] === option.option_id) {
                            delete next[entry.proposal_id];
                          }
                          return next;
                        }); }}
                      />
                      {keyboardShortcut ? (
                        <kbd
                          aria-hidden="true"
                          className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded bg-[var(--chrome-deep)] font-mono text-[10px] text-[var(--ink-muted)]"
                        >
                          {keyboardShortcut}
                        </kbd>
                      ) : null}
                      <span className="min-w-0 break-words font-medium text-[var(--ink)]">
                        {option.recommended ? "★ " : ""}{option.label}
                      </span>
                      {(option.playback_range ?? option.preview_range) ? (() => {
                        const range = (option.playback_range ?? option.preview_range)!;
                        const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
                        return <span className="text-xs tabular-nums text-[var(--ink-muted)]" aria-label={`Preview range ${clock(range.start_seconds)} to ${clock(range.end_seconds)}`}>{clock(range.start_seconds)}–{clock(range.end_seconds)}</span>;
                      })() : null}

                    </div>
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
                        />
                      );
                    })}
                    </ProposalAdvancedAdjustments>}
                    <div className="@container mt-3 flex flex-wrap items-center gap-1.5">
                      {/* A card that no longer applies offers no preview or apply, only Repair and Reject. */}
                      {!isStale && <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={`${REVIEW_SECONDARY_ACTION} px-2.5`}
                        onClick={() => playKeyboardOption(entry.proposal_id, option)}
                        disabled={isStale || (previewLoading && previewing)}
                        aria-busy={previewLoading && previewing}
                        aria-label={`${previewing ? "Replay" : "Preview"} ${option.label}`}
                        title={`${previewing ? "Replay" : "Preview"} · R`}
                        aria-keyshortcuts={selectedBatch.length === 1 && selectedBatch[0]?.proposalId === entry.proposal_id && selectedBatch[0]?.optionId === option.option_id ? "R" : undefined}
                      >
                        {previewLoading && previewing
                          ? <span role="status" className="inline-flex items-center gap-1.5">Loading <LoadingDots /></span>
                          : !previewing ? <PlayIcon aria-hidden="true" /> : <RotateCcwIcon aria-hidden="true" />}
                        {previewLoading && previewing ? null : previewing ? "Replay" : "Preview"}
                        {selectedBatch.length === 1 && selectedBatch[0]?.proposalId === entry.proposal_id && selectedBatch[0]?.optionId === option.option_id ? <kbd aria-hidden="true" className={REVIEW_KEY}>R</kbd> : null}
                      </Button>
                      {previewing ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className={compareShowingLive ? `${REVIEW_ACTION_SIZE} px-2.5 bg-[var(--chrome-selected-bg)] text-[var(--ink)] ring-1 ring-[var(--chrome-selected-ring)] hover:bg-[var(--chrome-selected-bg)]` : `${REVIEW_SECONDARY_ACTION} px-2.5`}
                          onClick={onToggleComparison ?? onExitPreview}
                          aria-pressed={compareShowingLive}
                          aria-label="Show before (B)"
                          title="Before · B"
                        >
                          <Columns2Icon aria-hidden="true" />
                          Before
                          <kbd aria-hidden="true" className={REVIEW_KEY}>B</kbd>
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        disabled={busy != null || isStale || Boolean(motionRendering[`${entry.proposal_id}:${option.option_id}`])}
                        className={`${REVIEW_ACTION_SIZE} px-2.5 ${REVIEW_APPLY_ACTION}`}
                        onClick={() => void approve(entry.proposal_id, option)}
                        aria-label={isChoice ? `Choose and apply ${option.label}` : `Apply ${option.label}`}
                        aria-keyshortcuts={applyKey ? "A" : undefined}
                        title={isStale ? "Out of date — ask the agent to propose again" : `${isChoice ? "Choose & apply" : "Apply"}${applyKey ? " · A" : ""}`}
                      >
                        <CheckIcon aria-hidden="true" />
                        {isChoice ? "Choose" : "Apply"}
                        {applyKey ? <kbd aria-hidden="true" className={REVIEW_KEY}>A</kbd> : null}
                      </Button>
                      </>}
                      {optionCount === 1 ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy != null}
                          className={`${REVIEW_SECONDARY_ACTION} ml-auto px-2.5 text-[var(--editor-destructive-ink)] hover:bg-red-500/10 hover:text-[var(--editor-destructive-ink)]`}
                          onClick={() => void reject(entry.proposal_id)}
                          aria-label="Reject proposal"
                          aria-keyshortcuts={previewing && !activePreview?.batch?.length ? "X" : undefined}
                          title={previewing ? "Reject this proposal · X" : "Reject this proposal"}
                        >
                          <XIcon aria-hidden="true" />
                          Reject
                          {previewing && !activePreview?.batch?.length ? <kbd aria-hidden="true" className={REVIEW_KEY}>X</kbd> : null}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {optionCount > 1 && <div className="mt-3 flex flex-wrap items-center gap-2">
                {(detail?.review.length ?? 0) > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className={REVIEW_SECONDARY_ACTION}
                    disabled={isStale || busy != null}
                    onClick={() => onPlayOptions((detail?.review ?? []).map((option) => ({
                      proposalId: entry.proposal_id,
                      optionId: option.option_id,
                      optionLabel: option.label,
                      overrides: overridesFor(entry.proposal_id, option),
                    })))}
                  >
                    <PlayIcon data-icon="inline-start" />
                    Play all {optionCount}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy != null}
                  className={`${REVIEW_SECONDARY_ACTION} ml-auto text-[var(--editor-destructive-ink)] hover:bg-red-500/10 hover:text-[var(--editor-destructive-ink)]`}
                  onClick={() => void reject(entry.proposal_id)}
                  aria-keyshortcuts={activePreview?.proposalId === entry.proposal_id && !activePreview.batch?.length ? "X" : undefined}
                  title={activePreview?.proposalId === entry.proposal_id ? "Reject this proposal · X" : "Reject this proposal"}
                >
                  Reject proposal
                  {activePreview?.proposalId === entry.proposal_id && !activePreview.batch?.length ? <kbd aria-hidden="true" className={REVIEW_KEY}>X</kbd> : null}
                </Button>
              </div>}
            </section>
          );
        })}
        {pendingRequests.map(request => (
          <div key={request.id} data-wave-step="request" className="flex min-h-9 flex-wrap items-center gap-2.5 px-3 py-1 text-sm text-[var(--ink-secondary)]">
            <span className="shrink-0 text-[var(--ink-muted)]">Up next</span>
            <span className="min-w-0 flex-1 truncate" title={request.direction}>{request.direction}</span>
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
