import { z } from "zod";
import { isLocalEditorRequest, localEditorOrigin } from "@/lib/local-request";
import { beginCloudSignIn, cancelCloudSignIn, cloudAccountStatus, signOutOfCloud } from "@/lib/local-store/cloud-account";
import { listStyleConflicts, readStyleSyncState, requestStyleSync, startStyleSyncLoop } from "@/lib/local-store/cloud-style-sync";
import { syncMembersSfxCatalog } from "@/lib/local-store/sfx-catalog-cloud";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

/** Account state for the editor. Never includes tokens. */
function status() {
  const account = cloudAccountStatus();
  const sync = readStyleSyncState();
  const current = sync && sync.account === account.email ? sync : null;
  return { ...account, style_sync: account.signed_in ? { revision: current?.revision ?? null, synced_at: current?.synced_at || null, error: current?.error ?? null, kept_versions: listStyleConflicts().length } : null };
}

export async function GET(request: Request) {
  if (!isLocalEditorRequest(request)) return response({ error: "Open Settings from the local editor." }, 403);
  startStyleSyncLoop();
  try { return response(status()); }
  catch { return response({ error: "Could not read the DreamCut account on this computer." }, 500); }
}

const bodySchema = z.object({ action: z.enum(["sign_in", "cancel", "sign_out", "sync"]) }).strict();
export async function POST(request: Request) {
  if (!isLocalEditorRequest(request, true)) return response({ error: "Account changes require the local editor." }, 403);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ error: "Unknown account action." }, 400);
  try {
    if (parsed.data.action === "sign_in") {
      const started = beginCloudSignIn(`${localEditorOrigin(request)}/api/user/cloud-account/callback`);
      return response({ ...status(), ...started });
    }
    if (parsed.data.action === "cancel") cancelCloudSignIn();
    if (parsed.data.action === "sign_out") {
      signOutOfCloud();
      await syncMembersSfxCatalog({ signed_in: false, member: null });
    }
    if (parsed.data.action === "sync") await requestStyleSync();
    return response(status());
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "Could not update the DreamCut account." }, 400);
  }
}
