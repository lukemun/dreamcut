import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  readAuditionManifest,
  writeAuditionManifest,
} from "@/lib/local-store/auditions";
import {
  captureProjectHistorySnapshot,
  readTimeline,
  withProjectLock,
  writeTimeline,
  readProjectFrameRate,
} from "@/lib/local-store/store";
import { rejectAuditionCandidate, selectAuditionWinner } from "@/lib/timeline/auditions";
import { quantizeVisualTrimValue } from "@/lib/timeline/frame-quantization";

type Params = { params: Promise<{ projectId: string }> };

const selectionSchema = z.object({
  section_id: z.string().min(1),
  candidate_id: z.string().min(1),
}).strict();

export async function GET(_request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    return NextResponse.json({ audition: readAuditionManifest(projectId) });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load auditions" }, { status });
  }
}

export const PATCH = withEditRequestActor(async function PATCH(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const parsed = selectionSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid audition selection" }, { status: 400 });

    return await withProjectLock(projectId, async () => {
      const current = readAuditionManifest(projectId);
      if (!current) return NextResponse.json({ error: "This project has no audition manifest" }, { status: 404 });
      const before = captureProjectHistorySnapshot(projectId, "audition_select_before");
      const next = selectAuditionWinner(current, parsed.data.section_id, parsed.data.candidate_id);
      const section = next.sections.find((candidate) => candidate.id === parsed.data.section_id)!;
      const timeline = readTimeline(projectId);
      const now = next.updated_at;

      for (const candidate of section.candidates) {
        const selected = candidate.id === section.winner_candidate_id;
        const candidateElementIds = [
          candidate.timeline_element_id,
          ...(candidate.associated_element_ids ?? []),
        ];
        const clip = timeline.elements.find((element) => element.id === candidate.timeline_element_id && element.removed_at == null);
        if (!clip) throw new Error(`Timeline candidate missing: ${candidate.timeline_element_id}`);
        for (const elementId of candidateElementIds) {
          const element = timeline.elements.find((item) => item.id === elementId && item.removed_at == null);
          if (!element) throw new Error(`Associated timeline candidate element missing: ${elementId}`);
          element.props = {
            ...element.props,
            selection: selected ? "user-selected" : "audition-candidate",
            selected_for: selected ? section.id : null,
            audition_winner: selected,
          };
          element.updated_at = now;
        }

        const label = timeline.elements.find((element) => element.id === candidate.label_element_id && element.removed_at == null);
        if (!label) throw new Error(`Timeline label missing: ${candidate.label_element_id}`);
        label.props = {
          ...label.props,
          text: selected
            ? `SELECTED · ${section.label.toUpperCase()} · ${candidate.source_label.toUpperCase()}`
            : `${section.label.toUpperCase()} · ${candidate.source_label.toUpperCase()}`,
          textColor: selected ? "#9EFFA1" : "#FFFFFF",
        };
        label.updated_at = now;
      }

      writeTimeline(projectId, timeline, `select_${section.id}_${parsed.data.candidate_id}`);
      writeAuditionManifest(projectId, next);
      // Explicit after-capture so the snapshot embeds the freshly written manifest.
      const after = captureProjectHistorySnapshot(projectId, `select_${section.id}_${parsed.data.candidate_id}`);
      return NextResponse.json({ audition: next, history: { before, after } });
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to select audition winner" }, { status });
  }
});

export const DELETE = withEditRequestActor(async function DELETE(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const parsed = selectionSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid audition rejection" }, { status: 400 });

    return await withProjectLock(projectId, async () => {
      const current = readAuditionManifest(projectId);
      if (!current) return NextResponse.json({ error: "This project has no audition manifest" }, { status: 404 });
      const before = captureProjectHistorySnapshot(projectId, "audition_reject_before");

      const section = current.sections.find((candidate) => candidate.id === parsed.data.section_id);
      const rejected = section?.candidates.find((candidate) => candidate.id === parsed.data.candidate_id);
      if (!section || !rejected) {
        return NextResponse.json({ error: "Audition candidate not found" }, { status: 404 });
      }

      const next = rejectAuditionCandidate(current, parsed.data.section_id, parsed.data.candidate_id);
      const timeline = readTimeline(projectId);
      const now = next.updated_at;
      const clip = timeline.elements.find((element) => element.id === rejected.timeline_element_id && element.removed_at == null);
      if (!clip) throw new Error(`Timeline candidate missing: ${rejected.timeline_element_id}`);
      const label = timeline.elements.find((element) => element.id === rejected.label_element_id && element.removed_at == null);
      if (!label) throw new Error(`Timeline label missing: ${rejected.label_element_id}`);

      const nextVideoStart = timeline.elements
        .filter((element) => element.removed_at == null && element.type === "video_clip" && element.timeline_start > clip.timeline_start)
        .reduce<number | null>((earliest, element) => earliest == null || element.timeline_start < earliest ? element.timeline_start : earliest, null);
      const fps = readProjectFrameRate(projectId);
      const removedSpan = quantizeVisualTrimValue(
        nextVideoStart == null ? clip.duration : nextVideoStart - clip.timeline_start,
        fps,
      );

      for (const elementId of [
        rejected.timeline_element_id,
        ...(rejected.associated_element_ids ?? []),
      ]) {
        const element = timeline.elements.find((item) => item.id === elementId && item.removed_at == null);
        if (!element) throw new Error(`Associated timeline candidate element missing: ${elementId}`);
        element.removed_at = now;
        element.removed_reason = "audition-rejected-by-user";
        element.props = {
          ...element.props,
          selection: "user-rejected",
          selected_for: null,
          audition_winner: false,
        };
        element.updated_at = now;
      }

      label.removed_at = now;
      label.removed_reason = "audition-rejected-by-user";
      label.updated_at = now;

      for (const element of timeline.elements) {
        if (element.removed_at == null && element.timeline_start > clip.timeline_start) {
          element.timeline_start = quantizeVisualTrimValue(element.timeline_start - removedSpan, fps);
          element.updated_at = now;
        }
      }

      writeTimeline(projectId, timeline, `reject_${section.id}_${rejected.id}`);
      writeAuditionManifest(projectId, next);
      // Explicit after-capture so the snapshot embeds the freshly written manifest.
      const after = captureProjectHistorySnapshot(projectId, `reject_${section.id}_${rejected.id}`);
      return NextResponse.json({ audition: next, removed_timeline_element_id: clip.id, history: { before, after } });
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to reject audition take" }, { status });
  }
});
