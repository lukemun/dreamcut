import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { NextResponse } from "next/server";
import { isTrustedLocalCodeRequest } from "@/lib/local-request";

import { parseCompositionSourceSpec } from "@/lib/local-store/hyperframes-candidates";
import { enqueueMediaPreparation, readPreparation } from "@/lib/local-store/media-preparation";
import { agentAuditArgs, appendMotionAuditEvent, type MotionAuditActor } from "@/lib/local-store/motion-audit";
import { readMotionJob, startMotionJob, type MotionJob } from "@/lib/local-store/motion-jobs";
import { runMotionScript } from "@/lib/local-store/motion-script-runner";
import { isSafeHyperframesCompositionId, projectExists } from "@/lib/local-store/paths";

type Params = { params: Promise<{ projectId: string }> };

/** Under the editor agent's 30 s tool timeout; longer renders continue and are polled. */
const INLINE_WAIT_MS = 20_000;
const INPUT_ERROR = /changed after it was proposed|must|Unsupported|Duplicate|not found|Invalid|controls file|Declared|never read|Unknown animation control|no element|between|one of its options/;

function jobResponse(projectId: string, job: MotionJob) {
  const key = job.key ? { job_key: job.key } : {};
  if (job.state === "rendering") {
    return {
      state: "rendering",
      composition_id: job.composition_id,
      ...key,
      started_at: job.started_at,
      next: { action: "motion_graphic_status", reason: "Rendering continues; poll until ready." },
    };
  }
  if (job.state === "failed") {
    return {
      state: "failed",
      composition_id: job.composition_id,
      ...key,
      error: job.error,
      next: { action: "motion_graphic_prepare", reason: "Fix the reported problem and prepare again." },
    };
  }
  const mediaPath = String(job.result?.media_path ?? "");
  const preparation = mediaPath ? readPreparation(projectId, mediaPath) ?? enqueueMediaPreparation(projectId, mediaPath) : null;
  const ready = preparation?.state === "ready";
  return {
    state: ready ? "ready" : "preparing_preview",
    ...job.result,
    ...key,
    warnings: job.warnings,
    preview: preparation ? { state: preparation.state, ...(preparation.error ? { error: preparation.error } : {}) } : null,
    next: ready
      ? { action: "proposal_create", reason: "Place it with create_visual (type video_clip, has_alpha true) using source_url and source window 0 to duration_seconds." }
      : { action: "motion_graphic_status", reason: "The editor preview is still being prepared; poll until ready." },
  };
}

/** The agent identity the MCP server sends, for the audit trail of a failed render; unknown fields stay null. */
function agentActorFrom(agent: unknown): MotionAuditActor {
  const value = (agent && typeof agent === "object" ? agent : {}) as Record<string, unknown>;
  const text = (input: unknown) => typeof input === "string" && input.trim() && input.length <= 200 ? input.trim() : null;
  return { type: "agent", name: text(value.name) ?? "editor-agent", model: text(value.model), effort: text(value.effort) };
}

function compositionIdFrom(value: unknown): string | null {
  return typeof value === "string" && isSafeHyperframesCompositionId(value) ? value : null;
}

/** Status of the latest agent render for a composition. */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params;
  if (!projectExists(projectId)) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const search = new URL(request.url).searchParams;
  const compositionId = compositionIdFrom(search.get("composition_id"));
  if (!compositionId) return NextResponse.json({ error: "composition_id is required" }, { status: 400 });
  const jobKey = search.get("job_key");
  if (jobKey !== null && !/^[a-f0-9]{16}$/.test(jobKey)) return NextResponse.json({ error: "job_key is invalid" }, { status: 400 });
  const job = readMotionJob(projectId, compositionId, jobKey ?? undefined);
  if (!job) return NextResponse.json({ error: "No render has been started for this motion graphic" }, { status: 404 });
  return NextResponse.json(jobResponse(projectId, job));
}

/**
 * Write (optionally), check and render a candidate motion graphic for a proposal.
 * Never edits the timeline or records approval; the proposal is the approval point.
 */
export async function POST(request: Request, { params }: Params) {
  if (!isTrustedLocalCodeRequest(request)) {
    return NextResponse.json({ error: "Code preparation requires a local editor or JSON CLI request." }, { status: 403 });
  }
  let specFile: string | null = null;
  try {
    const { projectId } = await params;
    if (!projectExists(projectId)) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const body = await request.json() as Record<string, unknown>;
    const compositionId = compositionIdFrom(body.composition_id);
    if (!compositionId) {
      return NextResponse.json({ error: "composition_id must use letters, numbers, dots, dashes or underscores" }, { status: 400 });
    }
    // The editor's review card and Properties re-render on a creator's control change; the agent passes its identity.
    const byPerson = body.actor === "person";
    if (byPerson && (body.files !== undefined || body.assets !== undefined)) {
      return NextResponse.json({ error: "Only control values can be changed from the review card" }, { status: 400 });
    }
    const args = ["prepare", projectId, compositionId, "--json", ...(byPerson ? [] : agentAuditArgs(body.agent))];
    if (typeof body.expected_source_fingerprint === "string" && /^[a-f0-9]{64}$/.test(body.expected_source_fingerprint)) {
      args.push("--expect-fingerprint", body.expected_source_fingerprint);
    }
    const previousValues = byPerson && body.previous_values && typeof body.previous_values === "object" && !Array.isArray(body.previous_values)
      ? body.previous_values as Record<string, unknown>
      : null;
    const nextValues = body.values && typeof body.values === "object" && !Array.isArray(body.values) ? body.values as Record<string, unknown> : null;
    const proposalId = typeof body.proposal_id === "string" ? body.proposal_id.slice(0, 200) : null;
    // Properties re-renders a placed clip; its element id attributes the value change.
    const elementId = typeof body.element_id === "string" ? body.element_id.slice(0, 200) : null;
    if (body.files !== undefined || body.assets !== undefined) {
      const spec = parseCompositionSourceSpec({ files: body.files, assets: body.assets });
      specFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-hf-spec-")), "spec.json");
      fs.writeFileSync(specFile, JSON.stringify(spec));
      args.push("--spec", `@${specFile}`);
    }
    if (body.values !== undefined) args.push("--values", JSON.stringify(body.values));
    if (Array.isArray(body.feedback_ids) && body.feedback_ids.every((id) => typeof id === "string")) {
      args.push("--feedback-ids", (body.feedback_ids as string[]).join(","));
    }
    if (typeof body.request === "string" && body.request.trim()) args.push("--request", body.request.slice(0, 2000));

    const spec = specFile;
    specFile = null; // The job owns the spec file now and removes it when the CLI finishes.
    // A value change from the editor renders beside other copies of the same graphic (three
    // section headers re-render at once rather than in turn); each set of values is its own job.
    const jobKey = byPerson && nextValues ? createHash("sha256").update(JSON.stringify(nextValues)).digest("hex").slice(0, 16) : undefined;
    const { job, done } = startMotionJob(projectId, compositionId, async () => {
      try {
        const { result, warnings } = await runMotionScript<Record<string, unknown>>("hyperframes-overlay", args);
        if (typeof result.media_path === "string") enqueueMediaPreparation(projectId, result.media_path);
        if (previousValues && nextValues) {
          for (const [target, value] of Object.entries(nextValues)) {
            if (previousValues[target] === value) continue;
            appendMotionAuditEvent(projectId, { kind: "composition", id: compositionId }, { type: "person", via: "editor" }, {
              type: "value_change", target: `control:${target}`, old_value: previousValues[target] ?? null, new_value: value,
              proposal_id: proposalId, element_id: elementId,
            });
          }
        }
        return { result, warnings };
      } finally {
        if (spec) fs.rmSync(path.dirname(spec), { recursive: true, force: true });
      }
    }, undefined, jobKey, byPerson ? { type: "person", via: "editor" } : agentActorFrom(body.agent));
    const settled = await Promise.race([done, new Promise<MotionJob>((resolve) => setTimeout(() => resolve(job), INLINE_WAIT_MS))]);
    const status = settled.state === "failed" && INPUT_ERROR.test(settled.error ?? "") ? 400 : 200;
    return NextResponse.json(jobResponse(projectId, settled), { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Motion graphic preparation failed";
    const status = (error as { status?: number }).status ?? (INPUT_ERROR.test(message) ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  } finally {
    if (specFile) fs.rmSync(path.dirname(specFile), { recursive: true, force: true });
  }
}
