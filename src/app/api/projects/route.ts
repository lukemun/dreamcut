import { NextResponse } from "next/server";
import { z } from "zod";

import { TIMELINE_ASPECT_RATIO_VALUES } from "@/lib/aspect-ratios";

import { isSafeProjectId, projectExists, projectIdForTitle } from "@/lib/local-store/paths";
import { createProject, withProjectLock } from "@/lib/local-store/store";

const schema = z.object({
  id: z.string().trim().refine(isSafeProjectId).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  aspect_ratio: z.enum(TIMELINE_ASPECT_RATIO_VALUES),
}).refine(value => value.id || value.title);

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a project name of up to 200 characters and choose a video shape." }, { status: 400 });
  }
  const { title, aspect_ratio } = parsed.data;
  // Keep explicit IDs compatible with existing callers, and derive safe IDs for names supplied by the editor.
  const id = parsed.data.id ?? projectIdForTitle(title!);
  return withProjectLock(id, () => {
    if (projectExists(id)) {
      return NextResponse.json({ error: "A project with that name already exists. Choose another name." }, { status: 409 });
    }
    // General delivery until a publishing platform is configured. Frame shape
    // must not silently opt the project into platform-specific safe areas.
    createProject(id, "web", title, { outputAspectRatio: aspect_ratio });
    return NextResponse.json({ id }, { status: 201 });
  });
}
