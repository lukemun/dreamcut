import { NextResponse } from "next/server";

import { isSafeMotionSubjectId } from "@/lib/local-store/motion-audit";
import { projectExists } from "@/lib/local-store/paths";
import { addSynthSoundToLibrary } from "@/lib/local-store/sfx-library-intake";

type Params = { params: Promise<{ projectId: string; soundId: string }> };

/** POST — add a synthesized project sound to the shared SFX Library (copy, analyze, catalog). */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { projectId, soundId } = await params;
    if (!projectExists(projectId)) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (!isSafeMotionSubjectId(soundId)) return NextResponse.json({ error: "Invalid sound id" }, { status: 400 });
    return NextResponse.json(await addSynthSoundToLibrary(projectId, soundId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add the sound to the Library";
    const status = /Invalid synthesized sound|ENOENT/.test(message) ? 404 : /no longer matches/.test(message) ? 409 : 500;
    return NextResponse.json({ error: status === 404 ? "This sound has not been rendered yet" : message }, { status });
  }
}
