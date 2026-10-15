"use client";

import { AlertTriangle, Check, Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type AnonymousTrackRole = "unassigned" | "primary_subject" | "other_subject";
export type TrackRebaseState = "proposed" | "needs_review" | "orphaned";
export type TrackConfirmationStatus = "unconfirmed" | "confirmed";

export type AnonymousTrackReviewItem = {
  trackId: string;
  trackOrdinal: number;
  sourceRevision: string;
  alias: string;
  role: AnonymousTrackRole;
  rebaseState: TrackRebaseState;
  confirmationStatus: TrackConfirmationStatus;
  confidence?: number | null;
};

export type ConfirmAnonymousTrackDecision = {
  trackId: string;
  sourceRevision: string;
  alias: string | null;
  role: Exclude<AnonymousTrackRole, "unassigned">;
};

type Props = {
  currentRevision: string;
  tracks: readonly AnonymousTrackReviewItem[];
  disabled?: boolean;
  onAliasChange: (trackId: string, alias: string) => void;
  onRoleChange: (trackId: string, role: AnonymousTrackRole) => void;
  onConfirm: (decision: ConfirmAnonymousTrackDecision) => void;
  onRequestRelink?: (trackId: string, sourceRevision: string) => void;
};

export type TrackReviewAvailability = {
  canEdit: boolean;
  canConfirm: boolean;
  reason: string | null;
};

export function getTrackReviewAvailability(
  track: AnonymousTrackReviewItem,
  currentRevision: string,
  disabled = false,
): TrackReviewAvailability {
  if (disabled) return { canEdit: false, canConfirm: false, reason: "Review is currently unavailable." };
  if (track.rebaseState === "orphaned") {
    return { canEdit: false, canConfirm: false, reason: "This track no longer maps to the current media." };
  }
  if (track.sourceRevision !== currentRevision) {
    return { canEdit: false, canConfirm: false, reason: "Rebase this track to the current media revision first." };
  }
  if (track.role === "unassigned") {
    return { canEdit: true, canConfirm: false, reason: "Choose a subject role before confirming." };
  }
  return { canEdit: true, canConfirm: true, reason: null };
}

export function buildAnonymousTrackDecision(
  track: AnonymousTrackReviewItem,
  currentRevision: string,
  disabled = false,
): ConfirmAnonymousTrackDecision | null {
  if (!getTrackReviewAvailability(track, currentRevision, disabled).canConfirm || track.role === "unassigned") {
    return null;
  }
  return {
    trackId: track.trackId,
    sourceRevision: track.sourceRevision,
    alias: track.alias.trim() || null,
    role: track.role,
  };
}

const rebaseCopy: Record<TrackRebaseState, { label: string; detail?: string }> = {
  proposed: {
    label: "Proposed",
  },
  needs_review: {
    label: "Needs review",
    detail: "Check this track before confirming.",
  },
  orphaned: {
    label: "No current match",
    detail: "No match in the current media.",
  },
};

const roleOptions: Array<{ value: AnonymousTrackRole; label: string }> = [
  { value: "unassigned", label: "Not decided" },
  { value: "primary_subject", label: "Primary subject" },
  { value: "other_subject", label: "Other subject" },
];

/**
 * Controlled, human-only confirmation surface for anonymous analysis tracks.
 * The component never derives an alias, assigns a role, or confirms on mount.
 */
export function MediaAnalysisReviewPanel({
  currentRevision,
  tracks,
  disabled = false,
  onAliasChange,
  onRoleChange,
  onConfirm,
  onRequestRelink,
}: Props) {
  if (tracks.length === 0) return null;

  return (
    <section
      data-media-analysis-review
      aria-labelledby="media-analysis-review-heading"
      className="grid gap-3 rounded-lg border border-[var(--chrome-line-strong)] bg-[var(--chrome-panel)] p-3 text-[var(--ink)]"
    >
      <header className="grid gap-1">
        <h2 id="media-analysis-review-heading" className="text-[1.05rem] font-bold">
          Review anonymous tracks
        </h2>
      </header>

      <div className="grid gap-3">
        {tracks.map((track) => {
          const stateCopy = rebaseCopy[track.rebaseState];
          const stateLabel =
            track.rebaseState !== "proposed"
              ? stateCopy.label
              : track.confirmationStatus === "confirmed"
                ? "Human confirmed"
                : stateCopy.label;
          const availability = getTrackReviewAvailability(track, currentRevision, disabled);
          const inputId = `analysis-track-${track.trackId}-alias`;
          const roleLegendId = `analysis-track-${track.trackId}-role`;
          return (
            <article
              key={track.trackId}
              data-track-review-state={track.rebaseState}
              className="grid gap-3 rounded-lg border border-[var(--chrome-line)] bg-[var(--chrome-deep)] p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold">Track {track.trackOrdinal}</h3>
                  <p className="mt-1 text-[0.82rem] text-[var(--ink-muted)]">
                    {track.confidence == null
                      ? "Confidence unavailable"
                      : `${Math.round(Math.min(1, Math.max(0, track.confidence)) * 100)}% evidence confidence`}
                  </p>
                </div>
                <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-[var(--chrome-line-strong)] bg-[var(--chrome-raised)] px-2.5 text-[0.76rem] font-bold">
                  {track.rebaseState === "needs_review" || track.rebaseState === "orphaned" ? (
                    <AlertTriangle aria-hidden="true" className="size-3.5" />
                  ) : track.confirmationStatus === "confirmed" ? (
                    <Check aria-hidden="true" className="size-3.5" />
                  ) : null}
                  {stateLabel}
                </span>
              </div>

              {stateCopy.detail ? <p className="text-[0.88rem] leading-5 text-[var(--ink-muted)]">{stateCopy.detail}</p> : null}

              <div className="grid gap-1.5">
                <label htmlFor={inputId} className="text-[0.92rem] font-bold">
                  Your label <span className="font-normal text-[var(--ink-muted)]">(optional)</span>
                </label>
                <Input
                  id={inputId}
                  value={track.alias}
                  disabled={!availability.canEdit}
                  onChange={(event) => onAliasChange(track.trackId, event.currentTarget.value)}
                  placeholder="Add a label you recognize"
                  autoComplete="off"
                  className="h-10 border-[var(--chrome-line-strong)] bg-[var(--chrome-raised)] text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] md:text-base"
                />
              </div>

              <fieldset disabled={!availability.canEdit} className="grid gap-1.5">
                <legend id={roleLegendId} className="mb-1 text-[0.92rem] font-bold">
                  Subject role
                </legend>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3" aria-labelledby={roleLegendId}>
                  {roleOptions.map((option) => {
                    const selected = track.role === option.value;
                    return (
                      <Button
                        key={option.value}
                        type="button"
                        variant="secondary"
                        size="studio"
                        aria-pressed={selected}
                        onClick={() => onRoleChange(track.trackId, option.value)}
                        className={`min-h-10 border px-3 text-[0.88rem] font-semibold ${
                          selected
                            ? "border-[var(--chrome-selected-ring)] bg-[var(--chrome-raised)] shadow-sm"
                            : "border-[var(--chrome-line)] bg-[var(--chrome-panel)]"
                        }`}
                      >
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
              </fieldset>

              {availability.reason ? (
                <p role="status" className="text-[0.88rem] font-semibold leading-5 text-[var(--ink)]">
                  {availability.reason}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                {track.rebaseState === "orphaned" && onRequestRelink ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="studio"
                    disabled={disabled}
                    onClick={() => onRequestRelink(track.trackId, track.sourceRevision)}
                    className="min-h-10 border-[var(--chrome-line-strong)] bg-[var(--chrome-raised)] px-3 text-[0.88rem] font-semibold text-[var(--ink)]"
                  >
                    <Link2 aria-hidden="true" />
                    Find a current match
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  size="studio"
                  disabled={!availability.canConfirm}
                  onClick={() => {
                    const decision = buildAnonymousTrackDecision(track, currentRevision, disabled);
                    if (decision) onConfirm(decision);
                  }}
                  className="min-h-10 border-[var(--chrome-line-strong)] bg-[var(--ink)] px-4 text-[0.88rem] font-bold text-[var(--chrome-deep)] hover:bg-[var(--ink)]"
                >
                  {track.confirmationStatus === "confirmed" ? "Save reviewed decision" : "Confirm decision"}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
