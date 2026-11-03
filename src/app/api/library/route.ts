import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertGenerationOrigin } from "@/lib/local-store/asset-generation";
import { LibraryError } from "@/lib/library/library";
import { librarySetup, libraryStatus } from "@/lib/library/setup";
import { listProjectIds, projectTimelinePath } from "@/lib/local-store/paths";
import { readProjectListMetadata } from "@/lib/local-store/project-list-metadata";
import fs from "node:fs";

const PROJECT_LIMIT = 100;
/** The projects an agent can open or edit, most recently changed first, so it can find one by name. */
function currentProjects() {
  let ids: string[];
  try { ids = listProjectIds(); } catch { return { projects: [], project_count: 0 }; }
  const projects = ids.flatMap(id => {
    try { return [{ id, title: readProjectListMetadata(id).title, updated_at: fs.statSync(projectTimelinePath(id)).mtime.toISOString() }]; }
    catch { return []; }
  }).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return { projects: projects.slice(0, PROJECT_LIMIT), project_count: projects.length };
}

/** Where projects live and which projects are there; problems opening the Library; older project folders that could move in. */
export async function GET() {
  try { return NextResponse.json({ ...libraryStatus(), ...currentProjects() }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Cannot read the Library" }, { status: 400 }); }
}

/** Create or choose a Library, or plan and run a confirmed migration of existing projects into it. */
export async function POST(request: Request) {
  try {
    assertGenerationOrigin(request);
    return NextResponse.json(librarySetup(await request.json()));
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues.map(i => `${i.path.join(".") || "request"}: ${i.message}`).join("; "), code: "INVALID_INPUT" }, { status: 422 });
    if (error instanceof LibraryError) return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Library setup failed" }, { status: 400 });
  }
}
