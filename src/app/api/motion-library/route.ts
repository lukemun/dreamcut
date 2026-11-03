import { NextResponse } from "next/server";
import { z } from "zod";

import { assertGenerationOrigin } from "@/lib/local-store/asset-generation";
import { listMotionLibrary, readMotionLibraryEntry, saveMotionLibraryEntry } from "@/lib/local-store/motion-library";
import { assertProject, withProjectLock } from "@/lib/local-store/store";

const saveSchema = z.object({
  project_id: z.string().min(1),
  element_id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).optional(),
}).strict();

/** The creator's saved motion graphics: the list, or one entry (?id=) with its full source for reuse. */
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    return NextResponse.json(id ? readMotionLibraryEntry(id) : { entries: listMotionLibrary() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Library unavailable" }, { status: (error as { status?: number }).status ?? 400 });
  }
}

/** Save a placed motion graphic and its linked sounds to the personal Library. Never edits a timeline. */
export async function POST(request: Request) {
  try {
    assertGenerationOrigin(request);
    const input = saveSchema.parse(await request.json());
    assertProject(input.project_id);
    const entry = await withProjectLock(input.project_id, () => saveMotionLibraryEntry(input.project_id, input));
    return NextResponse.json({ id: entry.id, name: entry.name, composition_id: entry.composition.composition_id, values: entry.composition.values,
      sounds: entry.sounds.map(sound => ({ title: sound.title, cue: sound.cue, offset_seconds: sound.offset_seconds })) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save to the Library" }, { status: 400 });
  }
}
