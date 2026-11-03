import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";
import { timelinePayload } from "@/lib/local-store/timeline-payload";

import { timelineElementPatchSchema, zodIssuesToMessage } from "@/lib/timeline/contracts";
import { applyPreparedElementPatch as applyElementPatch } from "@/lib/local-store/cutout-effects";
import { writeWithCaptionFollowers } from "@/lib/local-store/write-caption-followers";
import {
  activeTransitions,
  findElement,
  readTimeline,
  withProjectLock,
  readProjectFrameRate,
} from "@/lib/local-store/store";
import {
  softDeleteTransitionsForElements,
  syncTransitionsForElements,
} from "@/lib/local-store/transition-sync";
import {
  assertSpeechBoundVisualTimingPatch,
  assertSpeechClockMutationIsBundled,
  assertSpeechSynchronizationAfterMutation,
} from "@/lib/timeline/speech-sync-contract";

type Params = { params: Promise<{ projectId: string; elementId: string }> };

export const PATCH = withEditRequestActor(async function PATCH(request: Request, { params }: Params) {
  try {
    const { projectId, elementId } = await params;
    const body = await request.json();
    const parsed = timelineElementPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodIssuesToMessage(parsed.error) }, { status: 400 });
    }

    return await withProjectLock(projectId, async () => {
      const timeline = readTimeline(projectId);
      const existing = findElement(timeline, elementId);
      if (!existing || existing.removed_at != null) {
        return NextResponse.json({ error: "Timeline element not found" }, { status: 404 });
      }
      const beforeElements = structuredClone(timeline.elements);
      const previousSource = existing.source_url;
      assertSpeechBoundVisualTimingPatch(existing, parsed.data);
      assertSpeechClockMutationIsBundled({ elements: timeline.elements, element: existing, patch: parsed.data });
      applyElementPatch(existing, parsed.data, { fps: readProjectFrameRate(projectId) });
      assertSpeechSynchronizationAfterMutation({
        before: beforeElements,
        after: timeline.elements,
        touchedElementIds: new Set([elementId]),
      });

      // A patch that changes nothing (a click on a clip that did not move it) is not an edit:
      // writing it would add an invisible Undo step.
      const withoutStamp = (elements: typeof timeline.elements) => JSON.stringify(elements.map(({ updated_at: _updatedAt, ...rest }) => rest));
      if (withoutStamp(timeline.elements) === withoutStamp(beforeElements)) {
        return NextResponse.json({ element: findElement(readTimeline(projectId), elementId) ?? existing, transitions: activeTransitions(timeline) });
      }

      syncTransitionsForElements(timeline, [elementId]);
      const followers = writeWithCaptionFollowers(projectId, beforeElements, timeline, "element_patch");

      // A new source (e.g. a re-rendered motion graphic) needs its own validated preview,
      // which only the server can attach; otherwise the editor keeps playing the old one.
      const element = existing.source_url !== previousSource
        ? timelinePayload(projectId, { ...timeline, elements: [existing] }).elements[0] ?? existing
        : existing;
      return NextResponse.json({ ...followers, element, transitions: activeTransitions(timeline) });
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update timeline element" },
      { status },
    );
  }
});

export const DELETE = withEditRequestActor(async function DELETE(_request: Request, { params }: Params) {
  try {
    const { projectId, elementId } = await params;

    return await withProjectLock(projectId, async () => {
      const timeline = readTimeline(projectId);
      const existing = findElement(timeline, elementId);
      if (!existing || existing.removed_at != null) {
        return NextResponse.json({ error: "Timeline element not found" }, { status: 404 });
      }
      if (existing.position_locked) {
        return NextResponse.json(
          { error: "This clip is locked. Unlock it before removing it from the timeline." },
          { status: 400 },
        );
      }

      const beforeElements = structuredClone(timeline.elements);
      existing.removed_at = new Date().toISOString();
      existing.removed_reason = "user";
      existing.updated_at = new Date().toISOString();

      softDeleteTransitionsForElements(timeline, [elementId]);
      syncTransitionsForElements(timeline);
      const followers = writeWithCaptionFollowers(projectId, beforeElements, timeline, "element_delete");

      return NextResponse.json({ ...followers, ok: true, transitions: activeTransitions(timeline) });
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove timeline element" },
      { status },
    );
  }
});
