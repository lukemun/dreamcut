import { NextResponse } from "next/server";
import { z } from "zod";

import { TIMELINE_ASPECT_RATIO_VALUES } from "@/lib/aspect-ratios";

import { isSafeProjectId, projectExists } from "@/lib/local-store/paths";
import { createProject, withProjectLock } from "@/lib/local-store/store";

const schema = z.object({
  id: z.string().trim().refine(isSafeProjectId),
  aspect_ratio: z.enum(TIMELINE_ASPECT_RATIO_VALUES),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a project name using letters, numbers, hyphens, or underscores and choose an aspect ratio." }, { status: 400 });
  }
  const { id, aspect_ratio } = parsed.data;
  return withProjectLock(id, () => {
    if (projectExists(id)) {
      return NextResponse.json({ error: "A project with that name already exists. Choose another name." }, { status: 409 });
    }
    // General delivery until a publishing platform is configured. Frame shape
    // must not silently opt the project into platform-specific safe areas.
    createProject(id, "web", undefined, { outputAspectRatio: aspect_ratio });
    return NextResponse.json({ id }, { status: 201 });
  });
}
