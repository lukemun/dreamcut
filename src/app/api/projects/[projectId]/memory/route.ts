import { feedbackCoverage } from "@/lib/timeline/editing-feedback";
import { listProposals } from "@/lib/local-store/proposals";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assertProject, readTimeline, readMetadata } from "@/lib/local-store/store";
import { readPersonalStyleDocument, savePersonalStyleDocument, createRetroCheckpoint, createSkillMaintenanceJob, memoryAttentionCount, readMemoryView, readEditingProfile, resolveSkillMaintenanceJob, reviewSkillCandidate, writeEditingProfile, preferenceSchema, recordMemoryEvent, memoryEvents, retroPath, saveRetro, effectivePreferences, memoryViewVersion, memoryHash, memoryChapter, memoryRetroOutbox, readMemoryPage, MEMORY_CHAPTER_PAGE_MAX, MEMORY_CHAPTER_PAGE_SIZE, type RetroRecord } from "@/lib/local-store/editing-memory";
import { readFrameTags } from "@/lib/local-store/frame-tags";
import { runEditingRetro, resumeProjectRetros } from "@/lib/local-store/editing-retro";
import { runSkillMaintenance } from "@/lib/local-store/skill-maintenance";
import { readJsonFile } from "@/lib/local-store/atomic-json";
import path from "node:path";
import { memoryDir } from "@/lib/local-store/editing-memory";
import { coordinatorLimitsSchema } from "@/lib/local-store/retro-coordinator";
type Params = { params: Promise<{ projectId: string }> };
function retroResponse({ checkpoint: _checkpoint, ...retro }: RetroRecord) { return NextResponse.json({ retro }); }
export async function GET(request: Request, { params }: Params) {
  try {
    const { projectId } = await params; assertProject(projectId);
    const coordinatorId = new URL(request.url).searchParams.get("coordinator");
    if (coordinatorId !== null) {
      retroPath(projectId, coordinatorId); // Validate ID before constructing the receipt path.
      return NextResponse.json({ coordinator: readJsonFile(path.join(memoryDir(projectId), "coordinators", coordinatorId, "state.json"), null) });
    }
    // Page/history reads never dispatch retros (the Memory page uses POST "resume_retros"). Attention and agent
    // context reads keep the contract's restart recovery, guarded by a cheap outbox check so idle reads stay fast.
    const search = new URL(request.url).searchParams;
    const resumeQueuedRetros = () => { const outbox = memoryRetroOutbox(projectId); if (outbox.waiting || outbox.queued || outbox.running) resumeProjectRetros(projectId); };
    if (search.get("attention") === "true") { resumeQueuedRetros(); return NextResponse.json({ count: memoryAttentionCount(projectId) }); }
    if (search.get("context") === "true") resumeQueuedRetros();
    if (search.get("context") === "true") return NextResponse.json({
      preferences: effectivePreferences(projectId, readMetadata(projectId).output_aspect_ratio),
      style_document: { source: "STYLE.md", revision: readPersonalStyleDocument().revision },
      marks: readFrameTags(projectId).tags,
      feedback: feedbackCoverage(memoryEvents(projectId), listProposals(projectId)),
      precedence: "Current user request > project preference > personal preference > core skill. Within one scope, later style entries take precedence over earlier conflicting entries. Prepare proposals by default.",
    });
    if (search.get("download") === "ledger") return new Response(memoryEvents(projectId).map(e => JSON.stringify(e)).join("\n") + "\n", { headers: { "Content-Type": "application/x-ndjson", "Content-Disposition": "attachment; filename=edit-events.jsonl" } });
    const chapterId = search.get("chapter");
    if (chapterId !== null) return NextResponse.json({ chapter: memoryChapter(projectId, chapterId) });
    const page = search.get("view") === "page" ? pageQuerySchema.parse({ section: search.get("section") ?? undefined, limit: search.get("chapters_limit") ?? undefined,
      cursor: search.get("chapters_cursor") ?? undefined, category: search.get("chapter_category") ?? undefined }) : null;
    const version = memoryViewVersion(projectId);
    const etag = `"${page ? memoryHash({ version, page }) : version}"`;
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
    if (page) return NextResponse.json(readMemoryPage(projectId, page.section, page), { headers: { ETag: etag } });
    return NextResponse.json(readMemoryView(projectId), { headers: { ETag: etag } });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 400 }); }
}
const pageQuerySchema = z.object({ section: z.enum(["user", "history"]).default("history"), limit: z.coerce.number().int().min(1).max(MEMORY_CHAPTER_PAGE_MAX).default(MEMORY_CHAPTER_PAGE_SIZE),
  cursor: z.string().max(200).optional(), category: z.string().max(40).optional() }).strict();
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("resume_retros") }).strict(),
  z.object({ action: z.literal("style_document"), markdown: z.string().max(100000), expected_revision: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ action: z.literal("settings"), learning: z.boolean().optional(), agent_retros: z.boolean().optional(), auto_apply_preferences: z.boolean().optional(), cloud_sharing: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("preference"), id: z.string().uuid().optional(), text: preferenceSchema.shape.text, category: preferenceSchema.shape.category, scope: preferenceSchema.shape.scope, status: preferenceSchema.shape.status }).strict(),
  z.object({ action: z.literal("retro"), id: z.string().max(150).optional(), workflow: z.literal("slices-v1").optional(), limits: coordinatorLimitsSchema.optional() }).strict(),
  z.object({ action: z.literal("skill_candidate"), id: z.string().regex(/^[a-f0-9]{64}$/), decision: z.enum(["approve", "reject"]) }).strict(),
  z.object({ action: z.literal("skill_maintenance"), operation: z.enum(["start", "apply", "reject"]), id: z.string().uuid().optional() }).strict(),
]);
export async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params; assertProject(projectId);
    const body = bodySchema.parse(await request.json());
    if (body.action === "resume_retros") {
      // Resume only when the outbox has work, so idle page activity never reads full checkpoints.
      const outbox = memoryRetroOutbox(projectId);
      if (outbox.waiting || outbox.queued || outbox.running) resumeProjectRetros(projectId);
      return NextResponse.json({ retro_outbox: memoryRetroOutbox(projectId) });
    }
    if (body.action === "style_document") return NextResponse.json({ style_document: savePersonalStyleDocument(body.markdown, body.expected_revision) });
    if (body.action === "skill_candidate") return NextResponse.json({ candidate: reviewSkillCandidate(projectId, body.id, body.decision) });
    if (body.action === "skill_maintenance") {
      if (body.operation === "start") {
        const job = createSkillMaintenanceJob(projectId);
        if (job.status === "queued") void runSkillMaintenance(job.project_id, job.id);
        return NextResponse.json({ job });
      }
      if (!body.id) throw new Error("Skill maintenance id is required");
      return NextResponse.json({ job: resolveSkillMaintenanceJob(projectId, body.id, body.operation) });
    }
    if (body.action === "retro") {
      let retro: RetroRecord;
      if (body.id) {
        if (body.workflow || body.limits) throw new Error("Retry keeps its frozen workflow and limits; supply only the retro id");
        retro = readJsonFile<RetroRecord>(retroPath(projectId, body.id), null!);
        if (!retro) throw new Error("Retro not found");
        // A retry is not a new review and must never reset already-reviewed
        // skill candidates to pending. Use a new checkpoint for a fresh review.
        if (retro.status === "complete") return retroResponse(retro);
        if (retro.status === "running" && retro.pid) {
          try { process.kill(retro.pid, 0); return retroResponse(retro); } catch { /* interrupted worker */ }
        }
        retro = { ...retro, status: "queued" }; saveRetro(projectId, retro);
      } else {
        if (body.limits && !body.workflow) throw new Error("Coordinator limits require workflow slices-v1");
        retro = createRetroCheckpoint(projectId, randomUUID(), { timeline: readTimeline(projectId), metadata: readMetadata(projectId), trigger: "manual",
          ...(body.workflow ? { retro_workflow: body.workflow, coordinator_limits: body.limits ?? {} } : {}) }, false);
      }
      void runEditingRetro(projectId, retro.id).catch(error => saveRetro(projectId, { ...retro, status: "failed", error: String(error) }));
      return retroResponse(retro);
    }
    const profile = readEditingProfile();
    if (body.action === "settings") {
      if (body.learning !== undefined) profile.learning = body.learning;
      if (body.auto_apply_preferences !== undefined) profile.auto_apply_preferences = body.auto_apply_preferences;
      if (body.agent_retros !== undefined) profile.agent_retros = body.agent_retros;
      if (body.cloud_sharing !== undefined) profile.cloud_sharing = body.cloud_sharing;
    } else {
      const old = profile.preferences.find(p => p.id === body.id);
      if (body.id && !old) throw new Error("Preference not found");
      const preference = preferenceSchema.parse({ id: body.id ?? randomUUID(), text: body.text, category: body.category, scope: body.scope, status: body.status,
        project_id: body.scope === "project" ? projectId : undefined, origin: old?.origin ?? "human", evidence: old?.evidence ?? [], updated_at: new Date().toISOString() });
      profile.preferences = [...profile.preferences.filter(p => p.id !== preference.id), preference];
    }
    writeEditingProfile(profile);
    if (body.action === "settings") resumeProjectRetros(projectId);
    recordMemoryEvent(projectId, { type: `preference.${body.action}`, actor: "human", summary: body.action === "settings" ? "Updated learning settings" : `Style preference ${body.status}: ${body.text}` });
    return NextResponse.json({ profile });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 400 }); }
}
