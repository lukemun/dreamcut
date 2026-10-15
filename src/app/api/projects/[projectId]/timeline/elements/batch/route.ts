import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";
import { z } from "zod";

import { timelineRevision } from "@/lib/agent/timeline-editor-agent-apply";
import { timelineElementPatchSchema, zodIssuesToMessage } from "@/lib/timeline/contracts";
import { applyPreparedElementPatch as applyElementPatch, prepareCutoutEffects } from "@/lib/local-store/cutout-effects";
import { activeTransitions, captureProjectHistorySnapshot, findElement, readTimeline, withProjectLock, readProjectFrameRate } from "@/lib/local-store/store";
import { syncTransitionsForElements } from "@/lib/local-store/transition-sync";
import { writeWithCaptionFollowers } from "@/lib/local-store/write-caption-followers";
import {
  assertSpeechBoundVisualTimingPatch,
  assertSpeechClockMutationIsBundled,
  assertSpeechSynchronizationAfterMutation,
} from "@/lib/timeline/speech-sync-contract";

type Params = { params: Promise<{ projectId: string }> };

const operationSchema = z.object({
  element_id: z.string().uuid(),
  patch: timelineElementPatchSchema.omit({ props: true }).optional(),
  props: z.record(z.string(), z.unknown()).optional(),
}).strict().refine((value) => value.patch != null || value.props != null, "Empty mutation");
const schema = z.object({
  operations: z.array(operationSchema).min(1).max(500),
  // Optional optimistic-concurrency guard (sha256 of timeline.json at read time).
  // Same semantics as the proposal apply; catches writers the in-process lock can't.
  expected_revision: z.string().length(64).regex(/^[0-9a-f]+$/).optional(),
}).strict();

export const POST = withEditRequestActor(async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: zodIssuesToMessage(parsed.error) }, { status: 400 });
    return await withProjectLock(projectId, async () => {
      if (parsed.data.expected_revision && timelineRevision(projectId) !== parsed.data.expected_revision) {
        return NextResponse.json({ error: "Timeline revision changed since it was read; re-read and retry" }, { status: 409 });
      }
      const timeline = readTimeline(projectId);
      const beforeElements = structuredClone(timeline.elements);
      // Queue every missing member preview together, then fail atomically rather
      // than forcing one retry per compound member.
      let effectError: unknown;
      for (const operation of parsed.data.operations) {
        if (operation.props?.cutout_effects === undefined) continue;
        const member = findElement(timeline, operation.element_id);
        if (!member) continue;
        try { operation.props.cutout_effects = prepareCutoutEffects(member, operation.props.cutout_effects); }
        catch (error) { effectError = error; }
      }
      if (effectError) throw effectError;
      const touched: string[] = [];
      const bundledElementIds = new Set(parsed.data.operations.map((operation) => operation.element_id));
      for (const operation of parsed.data.operations) {
        const element = findElement(timeline, operation.element_id);
        if (!element || element.removed_at != null) return NextResponse.json({ error: `Timeline element not found: ${operation.element_id}` }, { status: 404 });
        const patch = {
          ...(operation.patch ?? {}),
          ...(operation.props ? { props: { ...((element.props ?? {}) as Record<string, unknown>), ...operation.props } } : {}),
        };
        assertSpeechBoundVisualTimingPatch(element, patch);
        assertSpeechClockMutationIsBundled({ elements: timeline.elements, element, patch, bundledElementIds });
        applyElementPatch(element, patch, { fps: readProjectFrameRate(projectId) });
        touched.push(element.id);
      }
      assertSpeechSynchronizationAfterMutation({
        before: beforeElements,
        after: timeline.elements,
        touchedElementIds: bundledElementIds,
      });
      syncTransitionsForElements(timeline, touched);
      const effectsBefore = parsed.data.operations.some(operation => operation.props?.cutout_effects !== undefined)
        ? captureProjectHistorySnapshot(projectId, "cutout_effects_before") : null;
      const followers = writeWithCaptionFollowers(projectId, beforeElements, timeline, "element_batch");
      return NextResponse.json({ ...followers,
        ...(effectsBefore ? { history: { before: effectsBefore, after: captureProjectHistorySnapshot(projectId, "cutout_effects_after") } } : {}),
        elements: touched.map((id) => findElement(timeline, id)), transitions: activeTransitions(timeline) });
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to batch mutate elements" }, { status });
  }
});
