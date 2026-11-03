"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getGenerationJob, listGenerationJobs } from "@/lib/generation/jobs-client";
import type {
  GenerationJobListItem,
  GenerationJobSnapshot,
} from "@/lib/generation/jobs-client";
import { isActiveJobStatus } from "@/lib/generation/jobs";

// Local fork: the app version layers a Supabase realtime channel over the
// polling below; here the polling (hydrate + active-job reconcile) is the
// only sync mechanism, so the hydrate interval defaults much lower.

type UseGenerationJobsTrackerOptions = {
  projectId?: string | null;
  /** Filters to jobs persisted with scope_type="design_canvas" and scope_id=this id.
   *  Used by the carousel workspace to track stills launched from a design. */
  designCanvasId?: string | null;
  targetTypes: string[];
  trackedJobIds?: string[];
  enabled?: boolean;
  hydrateIntervalMs?: number;
  reconcileIntervalMs?: number;
  onTerminalJob?: (job: GenerationJobSnapshot) => void;
  onCompleted?: (job: GenerationJobSnapshot) => void;
  onFailed?: (job: GenerationJobSnapshot) => void;
  onCanceled?: (job: GenerationJobSnapshot) => void;
  onSyncError?: (message: string) => void;
  autoClearTerminal?: boolean;
};

function sameJobSnapshot(a: GenerationJobSnapshot | undefined, b: GenerationJobSnapshot) {
  if (!a) return false;
  const aImageUrls = a.imageUrls ?? [];
  const bImageUrls = b.imageUrls ?? [];
  return (
    a.id === b.id &&
    a.status === b.status &&
    (a.statusLabel ?? null) === (b.statusLabel ?? null) &&
    (a.progress ?? null) === (b.progress ?? null) &&
    (a.targetType ?? null) === (b.targetType ?? null) &&
    (a.targetId ?? null) === (b.targetId ?? null) &&
    (a.projectId ?? null) === (b.projectId ?? null) &&
    (a.outputUrl ?? null) === (b.outputUrl ?? null) &&
    (a.error ?? null) === (b.error ?? null) &&
    aImageUrls.length === bImageUrls.length &&
    aImageUrls.every((url, index) => url === bImageUrls[index])
  );
}

export function useGenerationJobsTracker(options: UseGenerationJobsTrackerOptions) {
  const {
    projectId = null,
    designCanvasId = null,
    targetTypes,
    trackedJobIds,
    enabled = true,
    hydrateIntervalMs = 5_000,
    reconcileIntervalMs = 5_000,
    onTerminalJob,
    onCompleted,
    onFailed,
    onCanceled,
    onSyncError,
    autoClearTerminal = false,
  } = options;

  const [jobsById, setJobsById] = useState<Record<string, GenerationJobSnapshot>>({});
  const handledTerminalIdsRef = useRef<Set<string>>(new Set());
  const targetTypeKey = useMemo(() => targetTypes.join("|"), [targetTypes]);
  const stableTargetTypes = useMemo(
    () => Array.from(new Set(targetTypeKey.split("|").filter((value) => value.length > 0))),
    [targetTypeKey],
  );
  const targetTypeSet = useMemo(() => new Set(stableTargetTypes), [stableTargetTypes]);
  const trackedJobIdKey = useMemo(() => (trackedJobIds ?? []).join("|"), [trackedJobIds]);
  const stableTrackedJobIds = useMemo(
    () => Array.from(new Set(trackedJobIdKey.split("|").filter((value) => value.length > 0))),
    [trackedJobIdKey],
  );
  const trackedJobIdSet = useMemo(() => new Set(stableTrackedJobIds), [stableTrackedJobIds]);
  const hasTrackedJobFilter = trackedJobIdSet.size > 0;

  const upsertJobSnapshot = useCallback((next: GenerationJobSnapshot) => {
    setJobsById((prev) => {
      const merged = {
        ...prev[next.id],
        ...next,
      };
      if (sameJobSnapshot(prev[next.id], merged)) return prev;
      return {
        ...prev,
        [next.id]: merged,
      };
    });
  }, []);

  const clearTerminalJob = useCallback((jobId: string) => {
    setJobsById((prev) => {
      if (!prev[jobId]) return prev;
      const next = { ...prev };
      delete next[jobId];
      return next;
    });
    handledTerminalIdsRef.current.delete(jobId);
  }, []);

  const setJobsFromList = useCallback((jobs: GenerationJobListItem[]) => {
    const next: Record<string, GenerationJobSnapshot> = {};
    for (const job of jobs) {
      if (projectId && job.projectId !== projectId) continue;
      if (projectId && !(job.scopeType === "project" && job.scopeId === projectId)) continue;
      if (designCanvasId && !(
        (job.scopeType === "design_canvas" || job.scopeType === "image_design")
        && job.scopeId === designCanvasId
      )) continue;
      if (!targetTypeSet.has(job.targetType)) continue;
      if (hasTrackedJobFilter && !trackedJobIdSet.has(job.id)) continue;
      next[job.id] = {
        id: job.id,
        status: job.status,
        statusLabel: job.statusLabel,
        progress: job.progress,
        targetType: job.targetType,
        targetId: job.targetId ?? null,
        projectId: job.projectId ?? projectId ?? null,
        scopeType: job.scopeType ?? null,
        scopeId: job.scopeId ?? null,
        outputUrl: job.outputUrl ?? null,
        imageUrls: next[job.id]?.imageUrls ?? [],
        error: job.error ?? null,
      };
    }
    setJobsById(next);
  }, [hasTrackedJobFilter, trackedJobIdSet, projectId, designCanvasId, targetTypeSet]);

  const hydrateActiveJobs = useCallback(async () => {
    if (!enabled) return;
    const hydrateTargetType = stableTargetTypes.length === 1 ? stableTargetTypes[0] : undefined;
    const body = await listGenerationJobs({
      projectId: projectId ?? undefined,
      designCanvasId: designCanvasId ?? undefined,
      activeOnly: true,
      targetType: hydrateTargetType,
    });

    setJobsById((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const job of body.jobs ?? []) {
        if (hasTrackedJobFilter && !trackedJobIdSet.has(job.id)) continue;
        if (projectId && job.projectId !== projectId) continue;
        if (projectId && !(job.scopeType === "project" && job.scopeId === projectId)) continue;
        if (designCanvasId && !(
          (job.scopeType === "design_canvas" || job.scopeType === "image_design")
          && job.scopeId === designCanvasId
        )) continue;
        if (!targetTypeSet.has(job.targetType)) continue;
        const merged: GenerationJobSnapshot = {
          ...next[job.id],
          id: job.id,
          status: job.status,
          statusLabel: job.statusLabel,
          progress: job.progress,
          targetType: job.targetType,
          targetId: job.targetId ?? null,
          projectId: job.projectId ?? projectId ?? null,
          scopeType: job.scopeType ?? null,
          scopeId: job.scopeId ?? null,
          outputUrl: job.outputUrl ?? null,
          imageUrls: next[job.id]?.imageUrls ?? [],
          error: job.error ?? null,
        };
        if (!sameJobSnapshot(next[job.id], merged)) {
          next[job.id] = merged;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [enabled, hasTrackedJobFilter, stableTargetTypes, trackedJobIdSet, projectId, designCanvasId, targetTypeSet]);

  useEffect(() => {
    if (!enabled) return;

    const refresh = () => {
      void hydrateActiveJobs().catch((error) => {
        const message = error instanceof Error ? error.message : "Failed to refresh active generation jobs";
        onSyncError?.(message);
      });
    };

    // Hidden tabs skip the poll and catch up the moment they are shown.
    const refreshWhenVisible = () => { if (document.visibilityState !== "hidden") refresh(); };
    refresh();
    const id = window.setInterval(refreshWhenVisible, hydrateIntervalMs);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [enabled, hydrateActiveJobs, hydrateIntervalMs, onSyncError]);

  useEffect(() => {
    if (!enabled) return;

    const activeJobs = Object.values(jobsById).filter((job) => isActiveJobStatus(job.status));
    if (activeJobs.length === 0) return;

    let cancelled = false;
    const reconcileActiveJobs = async () => {
      const results = await Promise.allSettled(
        activeJobs.map(async (job) => {
          const body = await getGenerationJob(job.id);
          if (!body.job || cancelled) return;

          const targetType = body.job.targetType ?? job.targetType ?? null;
          if (!targetType || !targetTypeSet.has(targetType)) return;

          upsertJobSnapshot({
            id: body.job.id,
            status: body.job.status,
            statusLabel: body.job.statusLabel,
            progress: body.job.progress,
            targetType,
            targetId: body.job.targetId ?? job.targetId,
            projectId: body.job.projectId ?? projectId,
            outputUrl: body.job.outputUrl ?? job.outputUrl ?? null,
            imageUrls: body.job.imageUrls ?? job.imageUrls ?? [],
            error: body.job.error ?? null,
          });
        }),
      );

      if (cancelled) return;
      const hasHardFailure = results.some((result) => result.status === "rejected");
      if (hasHardFailure) {
        onSyncError?.("Job status sync temporarily failed. Retrying…");
      }
    };

    void reconcileActiveJobs().catch(() => {});
    const id = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void reconcileActiveJobs().catch(() => {});
    }, reconcileIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, jobsById, onSyncError, reconcileIntervalMs, targetTypeSet, projectId, upsertJobSnapshot]);

  useEffect(() => {
    const hasAnyHandler = Boolean(onTerminalJob || onCompleted || onFailed || onCanceled);
    if (!hasAnyHandler) return;

    for (const job of Object.values(jobsById)) {
      if (isActiveJobStatus(job.status)) {
        handledTerminalIdsRef.current.delete(job.id);
        continue;
      }
      if (handledTerminalIdsRef.current.has(job.id)) continue;

      handledTerminalIdsRef.current.add(job.id);
      onTerminalJob?.(job);
      if (job.status === "completed") onCompleted?.(job);
      else if (job.status === "failed") onFailed?.(job);
      else if (job.status === "canceled") onCanceled?.(job);
      if (autoClearTerminal) {
        setJobsById((prev) => {
          if (!prev[job.id]) return prev;
          const next = { ...prev };
          delete next[job.id];
          return next;
        });
        handledTerminalIdsRef.current.delete(job.id);
      }
    }
  }, [jobsById, onTerminalJob, onCompleted, onFailed, onCanceled, autoClearTerminal]);

  return {
    jobsById,
    upsertJobSnapshot,
    clearTerminalJob,
    hydrateActiveJobs,
    setJobsFromList,
  };
}
