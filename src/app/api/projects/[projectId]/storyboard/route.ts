import { NextResponse } from "next/server";
import { assertGenerationOrigin } from "@/lib/local-store/asset-generation";
import { readStoryboard, storyboardAssets, updateStoryboard, selectWorkspaceMedia } from "@/lib/local-store/storyboard";
import { readVisualCatalog, visualCatalogEntryAvailable } from "@/lib/local-store/visual-catalog";
import { readUserEffectRecipes, resolveUserEffectMedia } from "@/lib/local-store/user-effect-recipes";
import { profileDir } from "@/lib/local-store/editing-memory";
import { ingestMediaPath } from "@/lib/local-store/media-ingest";
type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, { params }: Context) {
  try { const { projectId } = await params;
    // Cheap change check for an open page: the agent can save a draft while it is open.
    if (new URL(request.url).searchParams.get("fields") === "revision") return NextResponse.json({ revision: readStoryboard(projectId).revision });
    return NextResponse.json({ ...readStoryboard(projectId), assets: storyboardAssets(projectId), catalogReferences: [...readUserEffectRecipes(profileDir()).recipes.map(r => ({ id: `user:${r.id}`, title: r.title, sourceHash: r.reference.sha256 })), ...readVisualCatalog().assets.filter(a => a.type === "video_clip" && visualCatalogEntryAvailable(a)).map(a => ({ id: a.id, title: a.title, sourceHash: a.sha256 }))] }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Cannot load storyboard" }, { status: 400 }); }
}
export async function POST(request: Request, { params }: Context) {
  try {
    assertGenerationOrigin(request);
    const { projectId } = await params;
    const input = await request.json();
    if (input.action === "prepare_reference") {
      if (typeof input.id !== "string") throw new Error("Choose a Catalog reference");
      const recipe = readUserEffectRecipes(profileDir()).recipes.find(r => r.id === input.id);
      const media = resolveUserEffectMedia(input.id, profileDir());
      if (!recipe || !media) throw new Error("Catalog reference is missing or changed");
      const imported = ingestMediaPath({ projectId, sourcePath: media.file, storageMode: "managed_copy", expectedSourceSha256: recipe.reference.sha256 });
      return NextResponse.json({ source: imported.media_path });
    }
    if (input.action === "select") {
      if (Array.isArray(input.sources)) return NextResponse.json(await selectWorkspaceMedia(projectId, input.sources));
      if (input.source !== null && typeof input.source !== "string") throw new Error("Invalid media selection");
      return NextResponse.json(await selectWorkspaceMedia(projectId, input.source));
    }
    return NextResponse.json(await updateStoryboard(projectId, input));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Cannot save storyboard" }, { status: (error as { status?: number }).status ?? 400 }); }
}
