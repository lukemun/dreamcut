"use client";

import { useCallback, useEffect, useState } from "react";

import type { AuditionCompileContract, AuditionCompileJob } from "@/lib/timeline/audition-compiles";
import type { AuditionManifest } from "@/lib/timeline/auditions";

import { AuditionShelf } from "./AuditionShelf";

export type AuditionMutationHistory = {
  before: { id: string; op: string; at: string };
  after: { id: string; op: string; at: string };
};

type AuditionCompileState = {
  enabled: boolean;
  contract: AuditionCompileContract | null;
  job: AuditionCompileJob | null;
};

type Props = {
  projectId: string;
  refreshToken: number;
  onPlayCandidates: (timelineElementIds: string[]) => void;
  onMutationHistory?: (history: AuditionMutationHistory) => void;
  onCountChange?: (count: number) => void;
};

/** Owns take-selection data for the dedicated Auditions panel. */
export function TakeAuditionReview({
  projectId,
  refreshToken,
  onPlayCandidates,
  onMutationHistory,
  onCountChange,
}: Props) {
  const [audition, setAudition] = useState<AuditionManifest | null>(null);
  const [compileState, setCompileState] = useState<AuditionCompileState | null>(null);

  const load = useCallback(async () => {
    const [auditionResponse, compileResponse] = await Promise.all([
      fetch(`/api/projects/${projectId}/timeline/auditions`).catch(() => null),
      fetch(`/api/projects/${projectId}/timeline/auditions/compile`).catch(() => null),
    ]);
    if (auditionResponse?.ok) {
      const body = await auditionResponse.json() as { audition?: AuditionManifest | null };
      setAudition(body.audition ?? null);
    }
    if (compileResponse?.ok) {
      setCompileState(await compileResponse.json() as AuditionCompileState);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  useEffect(() => {
    onCountChange?.(audition?.sections.length ?? 0);
  }, [audition?.sections.length, onCountChange]);

  const selectWinner = useCallback(async (sectionId: string, candidateId: string) => {
    const response = await fetch(`/api/projects/${projectId}/timeline/auditions`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ section_id: sectionId, candidate_id: candidateId }),
    });
    const body = await response.json() as {
      audition?: AuditionManifest;
      history?: AuditionMutationHistory;
      error?: string;
    };
    if (!response.ok || !body.audition) throw new Error(body.error ?? "Failed to save audition winner");
    setAudition(body.audition);
    if (body.history) onMutationHistory?.(body.history);
  }, [onMutationHistory, projectId]);

  const rejectCandidate = useCallback(async (sectionId: string, candidateId: string) => {
    const response = await fetch(`/api/projects/${projectId}/timeline/auditions`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ section_id: sectionId, candidate_id: candidateId }),
    });
    const body = await response.json() as {
      audition?: AuditionManifest;
      history?: AuditionMutationHistory;
      error?: string;
    };
    if (!response.ok || !body.audition) throw new Error(body.error ?? "Failed to remove audition take");
    setAudition(body.audition);
    if (body.history) onMutationHistory?.(body.history);
  }, [onMutationHistory, projectId]);

  const fetchCompileState = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/timeline/auditions/compile`);
    const body = await response.json() as AuditionCompileState & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Failed to load audition compile status");
    setCompileState(body);
  }, [projectId]);

  const compile = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/timeline/auditions/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmed: true }),
    });
    const body = await response.json() as { job?: AuditionCompileJob; error?: string };
    if (!response.ok || !body.job) throw new Error(body.error ?? "Failed to submit audition compile");
    setCompileState((current) => ({
      enabled: true,
      contract: current?.contract ?? body.job!.contract,
      job: body.job!,
    }));
  }, [projectId]);

  useEffect(() => {
    const status = compileState?.job?.status;
    if (status !== "queued" && status !== "running") return;
    const timer = window.setInterval(() => {
      void fetchCompileState().catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [compileState?.job?.status, fetchCompileState]);

  if (!audition) return null;

  return (
    <section className="border-b border-[var(--panel-group-divider,var(--chrome-line))] p-3" aria-label="Take audition review">
      <AuditionShelf
        audition={audition}
        onSelectWinner={selectWinner}
        onRejectCandidate={rejectCandidate}
        onPlayCandidates={onPlayCandidates}
        compileState={compileState}
        onCompile={compile}
      />
    </section>
  );
}
