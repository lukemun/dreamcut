"use client";

import { useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TimelineElement } from "./types";
import type { ProjectHistoryDescriptor } from "./external-history";
import { buildLaneDefs } from "./adapters";
import { videoAudioStatus } from "./video-audio-status";
import { captionAudioSourceId } from "@/lib/timeline/caption-audio-link";

const SPEECH_TYPES = ["vo_full", "vo_segment", "video_clip"];
type History = { before: ProjectHistoryDescriptor; after: ProjectHistoryDescriptor };

/**
 * Inline caption generation (no dialog): choose the timeline lane that carries the speech,
 * then Generate. Each speech clip on that lane is transcribed locally and turned into
 * linked captions in order; the captions are then edited like any other caption.
 */
export function GenerateCaptionsControl({ projectId, elements, selectedElement, onGenerated }: {
  projectId: string; elements: TimelineElement[]; selectedElement: TimelineElement | null;
  onGenerated: (history: History) => void;
}) {
  const lanes = useMemo(() => {
    // Videos without an audio track have nothing to caption.
    const sources = elements.filter(row => !row.removed_at && SPEECH_TYPES.includes(row.type) && row.volume > 0
      && videoAudioStatus(row)?.state !== "none");
    const labels = new Map(buildLaneDefs(elements.filter(row => !row.removed_at), new Map(), 1, {}).map(lane => [lane.key, lane]));
    const byLane = new Map<string, TimelineElement[]>();
    for (const row of sources) byLane.set(row.lane_key, [...(byLane.get(row.lane_key) ?? []), row]);
    return [...byLane].map(([key, clips]) => ({ key, label: labels.get(key)?.label ?? key, color: labels.get(key)?.color,
      clips: clips.sort((a, b) => a.timeline_start - b.timeline_start) }));
  }, [elements]);
  const preferredLane = useMemo(() => {
    const id = selectedElement?.type === "caption_text" ? captionAudioSourceId(selectedElement) : selectedElement?.id;
    return elements.find(row => row.id === id)?.lane_key;
  }, [elements, selectedElement]);
  const [chosen, setChosen] = useState<string | null>(null);
  const laneKey = lanes.some(lane => lane.key === chosen) ? chosen : lanes.find(lane => lane.key === preferredLane)?.key ?? lanes[0]?.key ?? null;
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const call = async (body: Record<string, unknown>) => {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/timeline/captions/generate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Caption generation failed.");
    return data;
  };
  const generate = async () => {
    const lane = lanes.find(item => item.key === laneKey);
    if (!lane) return;
    setMessage("");
    try {
      for (const [index, clip] of lane.clips.entries()) {
        const step = lane.clips.length > 1 ? ` clip ${index + 1} of ${lane.clips.length}` : "";
        setProgress(`Listening to${step || " the speech"}…`);
        const { sessionId, text } = await call({ action: "transcribe", elementId: clip.id });
        if (!String(text ?? "").trim()) continue; // No speech in this clip.
        setProgress(`Writing captions${step}…`);
        const result = await call({ action: "generate", sessionId, text });
        onGenerated(result.history);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Caption generation failed."); }
    finally { setProgress(null); }
  };
  if (!lanes.length) return <p className="py-2 text-sm text-[var(--ink-secondary)]">Add a clip with speech to the timeline to caption it</p>;
  return <section className="grid gap-2 py-2" aria-label="Generate captions">
    <p className="text-sm font-medium text-[var(--ink)]">Listen to the speech on</p>
    <div role="radiogroup" aria-label="Lane to caption" className="grid gap-0.5">
      {lanes.map(lane => {
        const selected = lane.key === laneKey;
        return <button key={lane.key} type="button" role="radio" aria-checked={selected} disabled={Boolean(progress)} onClick={() => setChosen(lane.key)}
          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)] disabled:opacity-60 ${selected ? "bg-[var(--chrome-selected-bg)] text-[var(--ink)]" : "text-[var(--ink-secondary)] hover:bg-[var(--chrome-raised)]"}`}>
          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: lane.color ?? "var(--ink-muted)" }} />
          <span className="min-w-0 flex-1 truncate">{lane.label}</span>
          <span className="shrink-0 text-[13px] text-[var(--ink-secondary)]">{lane.clips.length === 1 ? "1 clip" : `${lane.clips.length} clips`}</span>
        </button>;
      })}
    </div>
    <Button type="button" disabled={!laneKey || Boolean(progress)} onClick={() => void generate()}>
      {progress ? <><LoaderCircle aria-hidden className="size-4 animate-spin" />{progress}</> : "Generate captions"}
    </Button>
    {message ? <p role="alert" className="text-[13px] text-[var(--destructive)]">{message}</p> : null}
  </section>;
}
