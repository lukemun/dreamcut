import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";
import { z } from "zod";

import { readPeaks, readTimeline, withProjectLock, writePeaks } from "@/lib/local-store/store";
import { AUDIO_PEAK_ELEMENT_TYPES, PEAKS_PERSIST_MAX_ITEMS } from "@/lib/timeline/peaks";

type Params = { params: Promise<{ projectId: string }> };

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        source_url: z.string().min(1),
        peaks: z.array(z.number().min(-1).max(1)).min(1).max(10_000),
        source_duration_seconds: z.number().finite().gt(0),
      }),
    )
    .min(1)
    .max(PEAKS_PERSIST_MAX_ITEMS),
});

export const POST = withEditRequestActor(async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    return await withProjectLock(projectId, async () => {
      const timeline = readTimeline(projectId);
      const activeAudioUrls = new Set(
        timeline.elements
          .filter((element) => element.removed_at == null && AUDIO_PEAK_ELEMENT_TYPES.has(element.type))
          .map((element) => element.source_url)
          .filter((url): url is string => typeof url === "string"),
      );

      const peaks = readPeaks(projectId);
      let count = 0;
      for (const item of parsed.data.items) {
        if (!activeAudioUrls.has(item.source_url)) continue;
        peaks[item.source_url] = {
          peaks: item.peaks,
          source_duration_seconds: item.source_duration_seconds,
        };
        count += 1;
      }
      writePeaks(projectId, peaks);

      return NextResponse.json({ ok: true, count });
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save peaks" },
      { status },
    );
  }
});
