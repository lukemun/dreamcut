import os from "node:os";
import { z } from "zod";
import { assetDraftSchema } from "@/lib/generation/assets";
import { authoringInstructions, assembleAuthoredPrompt, promptDirectionSchema, PROMPT_AUTHORING_VERSION } from "@/lib/generation/prompt-authoring";
import { runWorker, codexWorker, claudePromptWorker } from "@/lib/agent/worker-runner";
import { assertGenerationOrigin } from "@/lib/local-store/asset-generation";
import { assertProject } from "@/lib/local-store/store";

export const runtime = "nodejs";
export const maxDuration = 180;
const active = new Set<string>();
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  let held: string | undefined;
  let writer: "codex" | "claude" = "codex";
  try {
    assertGenerationOrigin(request);
    const { projectId } = await params; assertProject(projectId);
    const input = z.object({ draft: assetDraftSchema, writer: z.enum(["codex", "claude"]).default("codex") }).strict().parse(await request.json());
    const { draft } = input; writer = input.writer;
    if (!draft.intent?.trim()) throw new Error("Describe what you want to happen first.");
    if (active.has(projectId)) return Response.json({ error: "A prompt is already being built for this project." }, { status: 409 });
    active.add(projectId); held = projectId;
    const result = await runWorker({ prompt: authoringInstructions(draft), cwd: os.tmpdir(), access: "read-only", timeoutMs: 150_000, signal: request.signal }, promptDirectionSchema, writer === "claude" ? claudePromptWorker : codexWorker);
    return Response.json({ prompt: assembleAuthoredPrompt(draft, result), summary: result.summary, assumptions: result.assumptions, version: PROMPT_AUTHORING_VERSION, author: writer === "claude" ? "Claude" : "Codex" });
  } catch {
    return Response.json({ error: `Prompt building could not finish. Check local ${writer === "claude" ? "Claude" : "Codex"} installation/sign-in and try again, or edit the generation prompt directly. Your existing prompt is unchanged; no paid fallback was used.` }, { status: 400 });
  } finally { if (held) active.delete(held); }
}
