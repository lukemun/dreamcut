"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckIcon, ExternalLinkIcon, InfoIcon, LoaderCircleIcon, PlayIcon, SendIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  auditionCandidatesShareRecording,
  type AuditionManifest,
} from "@/lib/timeline/auditions";
import type { AuditionCompileContract, AuditionCompileJob } from "@/lib/timeline/audition-compiles";
import { cn } from "@/lib/utils";

import { inspectorQuietButtonClassName } from "./InspectorHierarchy";

type Props = {
  audition: AuditionManifest;
  onSelectWinner: (sectionId: string, candidateId: string) => Promise<void>;
  onRejectCandidate: (sectionId: string, candidateId: string) => Promise<void>;
  onPlayCandidates: (timelineElementIds: string[]) => void;
  compileState: { enabled: boolean; contract: AuditionCompileContract | null; job: AuditionCompileJob | null } | null;
  onCompile: () => Promise<void>;
};

function formatTakeId(takeId: string): string {
  const number = Number(takeId.replace(/^take-/, ""));
  return Number.isFinite(number) ? `Take ${number}` : takeId;
}

export function AuditionShelf({ audition, onSelectWinner, onRejectCandidate, onPlayCandidates, compileState, onCompile }: Props) {
  const sections = useMemo(
    () => [...audition.sections].sort((a, b) => a.order - b.order),
    [audition.sections],
  );
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [lastReviewedCandidateId, setLastReviewedCandidateId] = useState<string | null>(null);

  const section = sections.find((candidate) => candidate.id === sectionId) ?? sections[0] ?? null;
  const selectionsComplete = sections.every((candidate) => candidate.winner_candidate_id != null);
  const compileJob = compileState?.job ?? null;
  const compileRunning = compiling || compileJob?.status === "queued" || compileJob?.status === "running";
  const compiledSelectionIsCurrent = compileJob?.selection_revision === audition.updated_at;
  const lockedSelectionLabels = sections.flatMap((candidate) => {
    const winner = candidate.candidates.find((item) => item.id === candidate.winner_candidate_id);
    return winner ? [winner.source_label] : [];
  });
  const lastReviewedCandidate = sections
    .flatMap((candidate) => candidate.candidates)
    .find((candidate) => candidate.id === lastReviewedCandidateId) ?? null;

  const playCandidate = useCallback((candidateId: string, timelineElementId: string) => {
    setLastReviewedCandidateId(candidateId);
    onPlayCandidates([timelineElementId]);
  }, [onPlayCandidates]);

  useEffect(() => {
    if (sections.some((candidate) => candidate.id === sectionId)) return;
    setSectionId(sections[0]?.id ?? "");
  }, [sectionId, sections]);

  const chooseWinner = useCallback(async (candidateId: string) => {
    if (!section) return;
    setSelectingId(candidateId);
    setSelectionError(null);
    try {
      await onSelectWinner(section.id, candidateId);
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : "Failed to save winner");
    } finally {
      setSelectingId(null);
    }
  }, [onSelectWinner, section]);

  const rejectCandidate = useCallback(async (candidateId: string) => {
    if (!section) return;
    setRejectingId(candidateId);
    setSelectionError(null);
    try {
      await onRejectCandidate(section.id, candidateId);
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : "Failed to remove take");
    } finally {
      setRejectingId(null);
    }
  }, [onRejectCandidate, section]);

  const compileSelection = useCallback(async () => {
    setCompiling(true);
    setSelectionError(null);
    try {
      await onCompile();
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : "Failed to submit compilation");
    } finally {
      setCompiling(false);
    }
  }, [onCompile]);

  if (!section) return null;

  return (
    <div className="flex min-h-0 flex-col gap-3" data-audition-shelf="" style={{ containerType: "inline-size" }}>
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <strong className="block truncate text-sm text-[var(--ink)]">Take audition</strong>
          <p className="m-0 truncate text-xs text-[var(--ink-secondary)]">{audition.source_note}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="default"
            className={inspectorQuietButtonClassName}
            onClick={() => onPlayCandidates(section.candidates.map((candidate) => candidate.timeline_element_id))}
          >
            <PlayIcon data-icon="inline-start" />
            Play all takes
          </Button>
          {compileState?.enabled ? (
            compileJob?.status === "completed" && compileJob.outcome === "compiled_for_review" && compiledSelectionIsCurrent ? (
              <Button
                variant="secondary"
                size="default"
                render={<a href={`/p/${compileJob.target_project_id}`} />}
              >
                <ExternalLinkIcon data-icon="inline-start" />
                Open assembled timeline
              </Button>
            ) : (
              <Button
                variant="default"
                size="default"
                disabled={!selectionsComplete || compileRunning}
                onClick={() => void compileSelection()}
                aria-label={selectionsComplete ? "Assemble timeline with agent" : "Pick every required winner before assembling"}
              >
                {compileRunning ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
                {compileRunning ? "Agent assembling…" : "Assemble with agent"}
              </Button>
            )
          ) : null}
        </div>
      </div>

      {compileState?.enabled || selectionsComplete ? (
        <div className="rounded-lg bg-[var(--chrome-deep)] px-3 py-2 text-sm text-[var(--ink-muted)]">
          {compileJob?.status === "failed" ? (
            <p role="alert"><strong className="text-[var(--ink)]">Agent assembly failed.</strong> {compileJob.error ?? ""}{compileJob.run_dir ? ` Journal: ${compileJob.run_dir}` : ""}</p>
          ) : compileJob?.status === "completed" && compileJob.outcome === "compiled_for_review" && compiledSelectionIsCurrent ? (
            <p><strong className="text-[var(--ink)]">Timeline assembled.</strong> {compileJob.summary ?? ""}{compileJob.run_dir ? ` Audit: ${compileJob.run_dir}` : ""}</p>
          ) : compileJob?.status === "completed" && compileJob.outcome === "blocked" && compiledSelectionIsCurrent ? (
            <p role="alert"><strong className="text-[var(--ink)]">Assembly blocked.</strong> {compileJob.summary ?? ""}</p>
          ) : compileRunning ? (
            <p><strong className="text-[var(--ink)]">Editor agent running…</strong></p>
          ) : !compileState?.enabled ? (
            <p><strong className="text-[var(--ink)]">Selection locked.</strong> {lockedSelectionLabels.join(" · ")}</p>
          ) : (
            <p><strong className="text-[var(--ink)]">Selection locked.</strong></p>
          )}
        </div>
      ) : null}

      {audition.exclusions?.length ? (
        <details className="rounded-lg bg-[var(--chrome-deep)] px-3 py-2 text-sm text-[var(--ink-muted)]">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[var(--ink)]">
            <InfoIcon className="size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {audition.exclusions.length} {audition.exclusions.length === 1 ? "attempt was" : "attempts were"} omitted during assembly
            </span>
          </summary>
          <ul className="mt-1 flex flex-col gap-1 pl-5">
            {audition.exclusions.map((exclusion) => (
              <li key={`${exclusion.section_id}-${exclusion.take_id}`} className="list-disc">
                {sections.find((candidate) => candidate.id === exclusion.section_id)?.label ?? "Section"} · {formatTakeId(exclusion.take_id)}: {exclusion.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="asset-shelf-tabs flex gap-1 overflow-x-auto px-1 pb-1">
        {sections.map((candidate, index) => (
          <Button
            key={candidate.id}
            variant={candidate.id === section.id ? "secondary" : "ghost"}
            size="default"
            onClick={() => {
              setSectionId(candidate.id);
              const firstTake = candidate.candidates[0];
              if (firstTake) playCandidate(firstTake.id, firstTake.timeline_element_id);
            }}
            className="shrink-0"
          >
            {index + 1}. {candidate.label}
            {candidate.winner_candidate_id ? <CheckIcon data-icon="inline-end" /> : null}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-3 rounded-lg bg-[var(--chrome-deep)] px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            Section {section.order + 1} · {section.candidates.length} takes · {section.label}
          </p>
          <p className="truncate text-sm leading-5 text-[var(--ink-muted)]">“{section.script_text}”</p>
        </div>
        {section.winner_candidate_id ? <CheckIcon className="shrink-0 text-[var(--ink)]" aria-label="Winner picked" /> : null}
        {selectionError ? <p role="alert" className="shrink-0 text-sm text-[var(--ink)]">{selectionError}</p> : null}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-2 pb-2">
        {section.candidates.map((candidate) => {
          const selected = section.winner_candidate_id === candidate.id;
          const sharesLastReviewedRecording = lastReviewedCandidate != null
            && lastReviewedCandidate.id !== candidate.id
            && auditionCandidatesShareRecording(lastReviewedCandidate, candidate);
          return (
            <article
              key={candidate.id}
              className={cn(
                "flex min-h-24 overflow-hidden rounded-lg border bg-[var(--chrome-deep)] transition-colors",
                selected ? "border-[var(--chrome-selected-ring)]" : "border-transparent",
              )}
            >
              <button
                type="button"
                onClick={() => playCandidate(candidate.id, candidate.timeline_element_id)}
                className="group flex min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--chrome-focus-ring)]"
                aria-label={`Play ${candidate.source_label} in the main player`}
              >
                <span className="relative block w-16 shrink-0 overflow-hidden bg-black">
                  <img src={candidate.thumbnail_url} alt="" className="size-full object-cover" />
                  <span className="absolute inset-0 grid place-items-center bg-black/15 transition-colors group-hover:bg-black/30">
                    <span className="grid size-8 place-items-center rounded-full bg-black/70 text-white">
                      <PlayIcon aria-hidden="true" />
                    </span>
                  </span>
                </span>
                <span className="min-w-0 flex-1 p-2">
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <strong className="min-w-0 truncate text-sm text-[var(--ink)]">{candidate.source_label}</strong>
                    {sharesLastReviewedRecording ? (
                      <span
                        className="shrink-0 rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[0.64rem] font-semibold leading-none text-emerald-300"
                        data-source-continuity="same-recording"
                      >
                        Same recording
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-sm text-[var(--ink-muted)]">{candidate.pass_label} · {candidate.duration_seconds.toFixed(1)}s</span>
                </span>
              </button>
              <div className="flex shrink-0 items-start p-2 pl-0">
                <TooltipProvider>
                  <div className="flex shrink-0 items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger
                        render={(
                          <Button
                            variant={selected ? "secondary" : "ghost"}
                            size="icon"
                            className={selected ? undefined : inspectorQuietButtonClassName}
                            disabled={selectingId != null || rejectingId != null || compileRunning || selected}
                            onClick={() => void chooseWinner(candidate.id)}
                            aria-label={selected ? `${candidate.source_label} selected` : `Pick ${candidate.source_label} as winner`}
                          >
                            <CheckIcon aria-hidden="true" />
                          </Button>
                        )}
                      />
                      <TooltipContent className="text-sm">{selected ? "Winner selected" : "Pick as winner"}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        render={(
                          <Button
                            variant="destructive"
                            size="icon"
                            disabled={selectingId != null || rejectingId != null || compileRunning || section.candidates.length === 1}
                            onClick={() => void rejectCandidate(candidate.id)}
                            aria-label={`Remove ${candidate.source_label} from audition and timeline`}
                          >
                            <XIcon aria-hidden="true" />
                          </Button>
                        )}
                      />
                      <TooltipContent className="text-sm">
                        {section.candidates.length === 1 ? "Keep at least one take" : "Remove from audition and timeline"}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
