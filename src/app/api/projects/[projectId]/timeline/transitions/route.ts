import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";

import { timelineTransitionCreateSchema, zodIssuesToMessage } from "@/lib/timeline/contracts";
import {
  DEFAULT_TRANSITION_DURATION_SECONDS,
  validateTransitionAdjacency,
} from "@/lib/timeline/transitions";
import type { TimelineTransition } from "@/components/studio/timeline/types";
import {
  activeElements,
  newId,
  newRowTimestamps,
  readTimeline,
  withProjectLock,
  writeTimeline,
} from "@/lib/local-store/store";

type Params = { params: Promise<{ projectId: string }> };

export const POST = withEditRequestActor(async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const parsed = timelineTransitionCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodIssuesToMessage(parsed.error) }, { status: 400 });
    }

    return await withProjectLock(projectId, async () => {
      const timeline = readTimeline(projectId);
      const elements = activeElements(timeline);

      const requestedDuration = parsed.data.duration_seconds ?? DEFAULT_TRANSITION_DURATION_SECONDS;
      const validation = validateTransitionAdjacency(
        elements,
        parsed.data.from_element_id,
        parsed.data.to_element_id,
        requestedDuration,
      );
      if (!validation.ok) {
        return NextResponse.json({ error: validation.reason }, { status: 400 });
      }

      const duplicate = timeline.transitions.find(
        (transition) =>
          transition.removed_at == null
          && transition.from_element_id === parsed.data.from_element_id
          && transition.to_element_id === parsed.data.to_element_id,
      );
      if (duplicate) {
        return NextResponse.json(
          { error: "A transition already exists on this boundary" },
          { status: 409 },
        );
      }

      const transition: TimelineTransition = {
        id: newId(),
        project_id: projectId,
        from_element_id: parsed.data.from_element_id,
        to_element_id: parsed.data.to_element_id,
        type: parsed.data.type,
        duration_seconds: validation.durationSeconds,
        params: parsed.data.params ?? {},
        removed_at: null,
        removed_reason: null,
        ...newRowTimestamps(),
      };
      timeline.transitions.push(transition);
      writeTimeline(projectId, timeline, "transition_create");

      return NextResponse.json({ transition });
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create transition" },
      { status },
    );
  }
});
