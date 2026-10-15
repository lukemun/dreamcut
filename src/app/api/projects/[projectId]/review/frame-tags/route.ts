import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";
import { z } from "zod";
import { updateFrameTag } from "@/lib/local-store/frame-tags";

import {
  addFrameTag,
  clearFrameTags,
  readFrameTags,
  removeFrameTag,
} from "@/lib/local-store/frame-tags";
import { withProjectLock } from "@/lib/local-store/store";

type Params = { params: Promise<{ projectId: string }> };

export const PATCH = withEditRequestActor(async function PATCH(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const { id, ...patch } = z.object({ id: z.string().uuid(), note: z.string().max(1000).optional() }).strict().parse(await request.json());
    const result = await withProjectLock(projectId, () => updateFrameTag(projectId, id, patch));
    return NextResponse.json({ tags: result.file.tags, history: result.history });
  } catch (error) { return NextResponse.json({ error: String(error) }, { status: 400 }); }
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    return NextResponse.json({ tags: readFrameTags(projectId).tags });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load marks" }, { status });
  }
}

export const POST = withEditRequestActor(async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const body = await request.json() as {
      timeline_seconds?: unknown;
      selected_element_ids?: unknown;
      point?: unknown;
    };
    if (typeof body.timeline_seconds !== "number" || !Number.isFinite(body.timeline_seconds)) {
      return NextResponse.json({ error: "timeline_seconds must be a finite number" }, { status: 400 });
    }
    const selectedElementIds = Array.isArray(body.selected_element_ids)
      ? body.selected_element_ids.filter((id): id is string => typeof id === "string")
      : [];
    const point = body.point && typeof body.point === "object"
      ? body.point as { x?: unknown; y?: unknown }
      : null;
    if (
      point
      && (
        typeof point.x !== "number"
        || !Number.isFinite(point.x)
        || typeof point.y !== "number"
        || !Number.isFinite(point.y)
      )
    ) {
      return NextResponse.json({ error: "point must contain finite x and y numbers" }, { status: 400 });
    }
    const result = await withProjectLock(projectId, () =>
      addFrameTag(
        projectId,
        body.timeline_seconds as number,
        selectedElementIds,
        point ? { x: point.x as number, y: point.y as number } : undefined,
      ));
    return NextResponse.json({
      tags: result.file.tags,
      tag: result.tag,
      created: result.created,
      updated: result.updated,
      history: result.history,
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to add mark" }, { status });
  }
});

export const DELETE = withEditRequestActor(async function DELETE(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const url = new URL(request.url);
    const clearAll = url.searchParams.get("all") === "true";
    const tagId = url.searchParams.get("id");
    if (!clearAll && !tagId) {
      return NextResponse.json({ error: "Provide id or all=true" }, { status: 400 });
    }
    const result = await withProjectLock(projectId, () =>
      clearAll ? clearFrameTags(projectId) : removeFrameTag(projectId, tagId!));
    return NextResponse.json({ tags: result.file.tags, history: result.history });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to remove mark" }, { status });
  }
});
