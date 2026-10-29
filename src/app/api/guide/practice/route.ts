import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

import { POST as createProposal } from "@/app/api/projects/[projectId]/timeline/proposals/route";
import { timelineRevision } from "@/lib/agent/timeline-editor-agent-apply";
import { isLocalEditorRequest } from "@/lib/local-request";
import { projectDir, projectExists } from "@/lib/local-store/paths";
import { enqueueMediaPreparation, readPreparation } from "@/lib/local-store/media-preparation";
import { listProposals } from "@/lib/local-store/proposals";
import { readTimeline } from "@/lib/local-store/store";
import { GUIDE_PRACTICE_PROJECT } from "@/lib/guide-tour";

export const dynamic = "force-dynamic";

/**
 * The practice kit ships in the repository: a small project (the bobblehead standing, then running,
 * as the creator's footage) with a 3D Sketch Scene already rendered, and the card that places it.
 * Its files name the kit's own project id, which the copy replaces with the practice project's.
 */
const KIT = path.join(process.cwd(), "public", "guide", "practice");
const KIT_PROJECT_ID = "guide-practice-kit";
const TEXT = /\.(json|html|js)$/;
/** The marker that makes the practice project the Guide's own; a creator's folder of the same name is never used. */
const MARKER = "guide-practice.json";
const failure = (error: unknown) => NextResponse.json({ error: error instanceof Error ? error.message : "Something went wrong" }, { status: (error as { status?: number }).status ?? 500 });

function copyKit(from: string, to: string, projectId: string) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name), target = path.join(to, entry.name);
    if (entry.isDirectory()) copyKit(source, target, projectId);
    else if (TEXT.test(entry.name)) fs.writeFileSync(target, fs.readFileSync(source, "utf8").replaceAll(KIT_PROJECT_ID, projectId));
    else fs.copyFileSync(source, target);
  }
}

/** Every video the kit places or offers, relative to the project's media folder. */
function kitVideos(dir = path.join(KIT, "project", "media"), prefix = ""): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? kitVideos(path.join(dir, entry.name), `${prefix}${entry.name}/`)
    : entry.name.endsWith(".webm") ? [`${prefix}${entry.name}`] : []);
}

function ensurePracticeProject() {
  const id = GUIDE_PRACTICE_PROJECT;
  if (!projectExists(id)) {
    try {
      copyKit(path.join(KIT, "project"), projectDir(id), id);
      fs.writeFileSync(path.join(projectDir(id), MARKER), JSON.stringify({ schema_version: 1, created_at: new Date().toISOString() }));
    } catch (error) {
      fs.rmSync(projectDir(id), { recursive: true, force: true });
      throw error;
    }
  } else if (!fs.existsSync(path.join(projectDir(id), MARKER))) {
    throw Object.assign(new Error(`A project named "${id}" already exists. Rename it to take the tour.`), { status: 409 });
  }
  return id;
}

/** Waits for the kit's videos to be ready to play in the editor (a few seconds the first time). */
async function preparePracticeMedia(projectId: string) {
  const videos = kitVideos();
  for (const video of videos) enqueueMediaPreparation(projectId, video);
  const deadline = Date.now() + 120_000;
  for (;;) {
    const states = videos.map(video => readPreparation(projectId, video)?.state);
    if (states.every(state => state === "ready")) return;
    if (states.includes("failed")) throw Object.assign(new Error("Could not prepare the practice videos. Try again."), { status: 500 });
    if (Date.now() > deadline) throw Object.assign(new Error("The practice videos are still being prepared. Try again in a minute."), { status: 503 });
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

/**
 * The card to review: the neon road the 3D Sketch Scene template built behind the bobblehead. Made only when
 * none is waiting and its clips are not already on the timeline (an approved card, even one since deleted).
 */
async function ensurePracticeCard(projectId: string) {
  if (listProposals(projectId, { status: "pending" }).length) return;
  const card = JSON.parse(fs.readFileSync(path.join(KIT, "card.json"), "utf8").replaceAll(KIT_PROJECT_ID, projectId));
  const cardIds = new Set<string>(card.options.flatMap((option: { operations: { element_id: string }[] }) => option.operations.map(operation => operation.element_id)));
  if (readTimeline(projectId).elements.some(element => cardIds.has(element.id))) return;
  const proposal = { ...card, project_id: projectId, expected_revision: timelineRevision(projectId) };
  const response = await createProposal(new Request(`http://127.0.0.1/api/projects/${projectId}/timeline/proposals`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(proposal),
  }), { params: Promise.resolve({ projectId }) });
  if (!response.ok) throw Object.assign(new Error((await response.json()).error ?? "Could not prepare the practice card."), { status: response.status });
}

/** One start at a time: a second request while the kit is copying or the card is being made waits for the first. */
let starting: Promise<string> | null = null;

async function startPractice() {
  const projectId = ensurePracticeProject();
  await preparePracticeMedia(projectId);
  await ensurePracticeCard(projectId);
  return projectId;
}

/** The Guide's practice material: makes (or reuses) the practice project and a card to review. */
export async function POST(request: Request) {
  if (!isLocalEditorRequest(request, true)) return NextResponse.json({ error: "The tour needs the local editor." }, { status: 403 });
  try {
    starting ??= startPractice().finally(() => { starting = null; });
    return NextResponse.json({ project_id: await starting });
  } catch (error) { return failure(error); }
}
