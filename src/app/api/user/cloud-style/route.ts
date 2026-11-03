import { z } from "zod";
import { isLocalEditorRequest } from "@/lib/local-request";
import { CloudSignedOutError, cloudAccountStatus } from "@/lib/local-store/cloud-account";
import { decideStyleSuggestion, dismissStyleConflict, listStyleConflicts, listStyleSuggestions, restoreStyleConflict } from "@/lib/local-store/cloud-style-sync";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const conflicts = () => listStyleConflicts().map(({ id, kept_at, local }) => ({ id, kept_at, markdown: local.markdown, templates: local.templates.length }));

/** Memory → My style: pending suggestions from the account and local versions kept after a sync conflict. */
export async function GET(request: Request) {
  if (!isLocalEditorRequest(request)) return response({ error: "Open Memory from the local editor." }, 403);
  const signedIn = cloudAccountStatus().signed_in;
  let suggestions: Awaited<ReturnType<typeof listStyleSuggestions>> = [];
  let error: string | null = null;
  if (signedIn) {
    try { suggestions = await listStyleSuggestions(); }
    catch (reason) { error = reason instanceof CloudSignedOutError ? null : "Style suggestions are unavailable right now."; }
  }
  return response({ signed_in: cloudAccountStatus().signed_in, suggestions, conflicts: conflicts(), error });
}

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("decide"), id: z.string().uuid(), decision: z.enum(["accept", "reject"]) }).strict(),
  z.object({ action: z.literal("restore_conflict"), id: z.string().max(80) }).strict(),
  z.object({ action: z.literal("dismiss_conflict"), id: z.string().max(80) }).strict(),
]);
export async function POST(request: Request) {
  if (!isLocalEditorRequest(request, true)) return response({ error: "Style changes require the local editor." }, 403);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ error: "Unknown style action." }, 400);
  try {
    const body = parsed.data;
    if (body.action === "decide") await decideStyleSuggestion(body.id, body.decision);
    if (body.action === "restore_conflict") restoreStyleConflict(body.id);
    if (body.action === "dismiss_conflict") dismissStyleConflict(body.id);
    return response({ ok: true, conflicts: conflicts() });
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "Could not update your style." }, error instanceof CloudSignedOutError ? 401 : 400);
  }
}
