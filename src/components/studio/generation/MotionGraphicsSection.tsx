"use client";
import { useCallback, useEffect, useState } from "react";
import { HyperframesCompositionPanel } from "@/components/studio/timeline/HyperframesCompositionPanel";
import type { HyperframesCompositionSummary } from "@/lib/local-store/hyperframes-overlays";

/** Generate → Motion graphics: create and render editable animations (moved out of the Library's video browser). */
export function MotionGraphicsSection({ projectId }: { projectId: string }) {
  const [compositions, setCompositions] = useState<HyperframesCompositionSummary[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/hyperframes`);
    if (!response.ok) throw new Error("Could not load motion graphics.");
    const data = await response.json() as { compositions?: HyperframesCompositionSummary[] };
    setCompositions(data.compositions ?? []);
  }, [projectId]);
  useEffect(() => { void load().catch(reason => setError((reason as Error).message)); }, [load]);
  if (error) return <p role="alert" className="text-sm">{error}</p>;
  if (!compositions) return <p role="status" className="text-sm text-[var(--ink-secondary)]">Loading motion graphics…</p>;
  return <HyperframesCompositionPanel projectId={projectId} compositions={compositions} onRefresh={load} />;
}
