import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";

import { timelineTransitionPatchSchema, zodIssuesToMessage } from "@/lib/timeline/contracts";
import { validateTransitionAdjacency } from "@/lib/timeline/transitions";
import {
  activeElements,
  readTimeline,
  withProjectLock,
  writeTimeline,
} from "@/lib/local-store/store";

type Params = { params: Promise<{ projectId: string; transitionId: string }> };

export const PATCH = withEditRequestActor(async function PATCH(request: Request, { params }: Params) {
  try {
    const { projectId, transitionId } = await params;
    const body = await request.json();
    const parsed = timelineTransitionPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodIssuesToMessage(parsed.error) }, { status: 400 });
    }

    return await withProjectLock(projectId, async () => {
      const timeline = readTimeline(projectId);
      const transition = timeline.transitions.find(
        (candidate) => candidate.id === transitionId && candidate.removed_at == null,
      );
      if (!transition) {
        return NextResponse.json({ error: "Transition not found" }, { status: 404 });
      }

      const requestedDuration = parsed.data.duration_seconds ?? transition.duration_seconds;
      const validation = validateTransitionAdjacency(
        activeElements(timeline),
        transition.from_element_id,
        transition.to_element_id,
        requestedDuration,
      );
      if (!validation.ok) {
        return NextResponse.json({ error: validation.reason }, { status: 400 });
      }

      if (parsed.data.type !== undefined) transition.type = parsed.data.type;
      if (parsed.data.params !== undefined) transition.params = parsed.data.params;
      transition.duration_seconds = validation.durationSeconds;
      transition.updated_at = new Date().toISOString();
      writeTimeline(projectId, timeline, "transition_patch");

      return NextResponse.json({ transition });
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update transition" },
      { status },
    );
  }
});

export const DELETE = withEditRequestActor(async function DELETE(_request: Request, { params }: Params) {
  try {
    const { projectId, transitionId } = await params;

    return await withProjectLock(projectId, async () => {
      const timeline = readTimeline(projectId);
      const transition = timeline.transitions.find(
        (candidate) => candidate.id === transitionId && candidate.removed_at == null,
      );
      if (!transition) {
        return NextResponse.json({ error: "Transition not found" }, { status: 404 });
      }

      transition.removed_at = new Date().toISOString();
      transition.removed_reason = "user";
      transition.updated_at = new Date().toISOString();
      writeTimeline(projectId, timeline, "transition_delete");

      return NextResponse.json({ ok: true });
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete transition" },
      { status },
    );
  }
});
