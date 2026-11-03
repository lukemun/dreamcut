"use client";

import { useEffect, useMemo, useState } from "react";

import { InspectorSection } from "./InspectorSection";
import { ProposalMotionControls } from "./ProposalMotionControls";
import { createTimelineClient, type ProposalMotionItem } from "./timeline-client";
import type { TimelineElement } from "./types";

/**
 * Properties for a motion graphic already on the timeline: the controls its composition
 * declared (copy, colours, numbers, timings), the same ones the proposal card shows. A
 * committed change renders that value set in the background, then swaps this clip to the new
 * render as one ordinary clip edit, so Undo restores the previous render and values. A timing
 * knob's new length and cue times follow on the server, and linked sounds move with them.
 */
export function MotionGraphicProperties({ element, patchElement }: {
  element: TimelineElement;
  patchElement: (elementId: string, patch: Record<string, unknown>) => void | Promise<unknown>;
}) {
  const client = useMemo(() => createTimelineClient(element.project_id), [element.project_id]);
  const sourceUrl = element.source_url ?? "";
  const [item, setItem] = useState<ProposalMotionItem | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setItem(null); setError("");
    client.motionControlsFor(sourceUrl).then(next => { if (alive) setItem(next); })
      .catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : "Controls unavailable"); });
    return () => { alive = false; };
  }, [client, sourceUrl]);
  // The section shows only when there is something to tune or a reason it cannot be tuned.
  if (!error && !item?.controls?.length) return null;
  // The server applies the new render's length, cue times and any ripple, and moves linked sounds.
  const swap = (url: string | undefined) => { if (url) void patchElement(element.id, { source_url: url }); };
  return (
    <InspectorSection sectionId="motion-graphic" title="Motion graphic">
      {error || !item
        ? <p role="alert" className="m-0 text-sm text-[var(--editor-destructive-ink)]">{error}</p>
        : <ProposalMotionControls key={item.source_url} item={item} title={typeof element.props?.title === "string" ? element.props.title : undefined} elementId={element.id} client={client} disabled={false} renderedUrl={undefined} onRendered={swap} />}
    </InspectorSection>
  );
}
