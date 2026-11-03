import { feedbackCoverage } from "@/lib/timeline/editing-feedback";
import { listProposals } from "@/lib/local-store/proposals";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assertProject, readTimeline, readMetadata } from "@/lib/local-store/store";
import { readPersonalStyleDocument, savePersonalStyleDocument, readMemoryView, readEditingProfile, writeEditingProfile, preferenceSchema, recordMemoryEvent, memoryEvents, effectivePreferences, memoryViewVersion, memoryHash, memoryChapter, readMemoryPage, MEMORY_CHAPTER_PAGE_MAX, MEMORY_CHAPTER_PAGE_SIZE } from "@/lib/local-store/editing-memory";
import { readFrameTags } from "@/lib/local-store/frame-tags";
type Params = { params: Promise<{ projectId: string }> };
/** Recent page bodies by project and ETag; a few hundred KB each. */
const pageBodies = new Map<string, string>();
export async function GET(request: Request, { params }: Params) {
  try {
    const { projectId } = await params; assertProject(projectId);
    const search = new URL(request.url).searchParams;
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
    const version = memoryViewVersion(projectId, page?.section === "history" ? "history" : "full");
    const etag = `"${page ? memoryHash({ version, page }) : version}"`;
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
    if (page) {
      // The ETag covers every input of the page, so another tab's poll reuses the body built for it.
      const key = `${projectId}\0${etag}`;
      let text = pageBodies.get(key);
      if (text === undefined) text = JSON.stringify(readMemoryPage(projectId, page.section, page));
      pageBodies.delete(key);
      pageBodies.set(key, text);
      if (pageBodies.size > 8) pageBodies.delete(pageBodies.keys().next().value!);
      return new Response(text, { headers: { "Content-Type": "application/json", ETag: etag } });
    }
    return NextResponse.json(readMemoryView(projectId), { headers: { ETag: etag } });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 400 }); }
}
const pageQuerySchema = z.object({ section: z.enum(["user", "history"]).default("history"), limit: z.coerce.number().int().min(1).max(MEMORY_CHAPTER_PAGE_MAX).default(MEMORY_CHAPTER_PAGE_SIZE),
  cursor: z.string().max(200).optional(), category: z.string().max(40).optional() }).strict();
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("style_document"), markdown: z.string().max(100000), expected_revision: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ action: z.literal("settings"), cloud_sharing: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("preference"), id: z.string().uuid().optional(), text: preferenceSchema.shape.text, category: preferenceSchema.shape.category, scope: preferenceSchema.shape.scope, status: preferenceSchema.shape.status }).strict(),
]);
export async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params; assertProject(projectId);
    const body = bodySchema.parse(await request.json());
    if (body.action === "style_document") return NextResponse.json({ style_document: savePersonalStyleDocument(body.markdown, body.expected_revision) });
    const profile = readEditingProfile();
    if (body.action === "settings") {
      if (body.cloud_sharing !== undefined) profile.cloud_sharing = body.cloud_sharing;
    } else {
      const old = profile.preferences.find(p => p.id === body.id);
      if (body.id && !old) throw new Error("Preference not found");
      const preference = preferenceSchema.parse({ id: body.id ?? randomUUID(), text: body.text, category: body.category, scope: body.scope, status: body.status,
        project_id: body.scope === "project" ? projectId : undefined, origin: old?.origin ?? "human", evidence: old?.evidence ?? [], updated_at: new Date().toISOString() });
      profile.preferences = [...profile.preferences.filter(p => p.id !== preference.id), preference];
    }
    writeEditingProfile(profile);
    recordMemoryEvent(projectId, { type: `preference.${body.action}`, actor: "human", summary: body.action === "settings" ? "Updated sharing settings" : `Style preference ${body.status}: ${body.text}` });
    return NextResponse.json({ profile });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 400 }); }
}
