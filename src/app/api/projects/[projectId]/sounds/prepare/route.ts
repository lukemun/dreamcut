import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { NextResponse } from "next/server";

import { agentAuditArgs, isSafeMotionSubjectId } from "@/lib/local-store/motion-audit";
import { runMotionScript } from "@/lib/local-store/motion-script-runner";
import { projectExists } from "@/lib/local-store/paths";

type Params = { params: Promise<{ projectId: string }> };

const activeSounds = new Set<string>();

/**
 * Write (optionally) and render a code-synthesized sound. Local preparation only:
 * no timeline edit or approval. The proposal that places it is the review point.
 */
export async function POST(request: Request, { params }: Params) {
  let key: string | null = null;
  let specFile: string | null = null;
  try {
    const { projectId } = await params;
    if (!projectExists(projectId)) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const body = await request.json() as Record<string, unknown>;
    const soundId = body.sound_id;
    if (typeof soundId !== "string" || !isSafeMotionSubjectId(soundId)) {
      return NextResponse.json({ error: "sound_id must use letters, numbers, dots, dashes or underscores" }, { status: 400 });
    }
    const args = ["prepare", projectId, soundId, "--json", ...agentAuditArgs(body.agent)];
    if (body.synth_js !== undefined || body.controls !== undefined) {
      if (body.synth_js !== undefined && typeof body.synth_js !== "string") {
        return NextResponse.json({ error: "synth_js must be JavaScript source text" }, { status: 400 });
      }
      specFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-synth-spec-")), "spec.json");
      fs.writeFileSync(specFile, JSON.stringify({ synth_js: body.synth_js, controls: body.controls }));
      args.push("--spec", `@${specFile}`);
    }
    if (body.values !== undefined) args.push("--values", JSON.stringify(body.values));
    if (body.seed !== undefined) {
      if (!Number.isInteger(body.seed)) return NextResponse.json({ error: "seed must be a whole number" }, { status: 400 });
      args.push("--seed", String(body.seed));
    }
    if (Array.isArray(body.feedback_ids) && body.feedback_ids.every((id) => typeof id === "string")) {
      args.push("--feedback-ids", (body.feedback_ids as string[]).join(","));
    }
    if (typeof body.request === "string" && body.request.trim()) args.push("--request", body.request.slice(0, 2000));

    key = `${projectId}:${soundId}`;
    if (activeSounds.has(key)) {
      key = null;
      return NextResponse.json({ error: "This sound is already being prepared" }, { status: 409 });
    }
    activeSounds.add(key);
    const { result, warnings } = await runMotionScript<Record<string, unknown>>("sound-synth", args);
    return NextResponse.json({
      ...result,
      warnings,
      next: { action: "proposal_create", reason: "Place it with create_audio using source_url and a full source window." },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sound preparation failed";
    const status = /must|Invalid|controls file|Unknown animation control|render\(\)|Channel|samples|limited|not defined|disallowed|timed out/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  } finally {
    if (key) activeSounds.delete(key);
    if (specFile) fs.rmSync(path.dirname(specFile), { recursive: true, force: true });
  }
}
