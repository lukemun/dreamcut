import { isLocalEditorRequest } from "@/lib/local-request";
import { cloudMembership } from "@/lib/cloud/membership";
import { syncMembersSfxCatalog } from "@/lib/local-store/sfx-catalog-cloud";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Membership state and offer for the editor's upgrade prompts. Never includes tokens. */
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!isLocalEditorRequest(request)) return Response.json({ error: "Open DreamCut from the local editor." }, { status: 403, headers });
  const membership = await cloudMembership();
  // A member gets the members-only sound list; it and its sounds leave this computer once membership has
  // definitely ended or the creator signed out.
  await syncMembersSfxCatalog(membership).catch(error => console.error("[sound-catalog] members' list", error));
  return Response.json(membership, { headers });
}
