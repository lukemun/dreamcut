import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { assetDraftSchema, validateAssetRequest, type AssetDraft } from "../generation/assets";
import { getAssetModel, MEDIA_ROLES, modelTask, ROLE_LABELS } from "../generation/asset-models";
import { checkGeneration } from "../generation/cloud-readiness";
import { defaultModelId, promptGuide, qualityDefaults } from "../generation/model-guides";
import { createAssetJob, generationDir, jobPath, probeMediaDuration, readAssetJob, resolveGenerationSource } from "./asset-generation";
import { chatSignInUrl, DraftSubmitRefusal, READINESS_GUIDANCE, stageAssetDraft, stagedDraftShown, submitStagedDraft } from "./asset-generation-workspace";
import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";
import { ingestMediaPath } from "./media-ingest";
import { projectExists } from "./paths";
import { assertProject, createProject } from "./store";
import { BUY_CREDITS_URL } from "@/lib/cloud/base-url";

/**
 * Chat-first generation (generate_media): an agent drafts a request with the recommended model and settings, which
 * also fills the Generate form (an open editor brings it up) so the creator sees the exact prompt. It generates when
 * the creator clicks Generate, or approves the price in chat. Without a project, results land in the "Generations"
 * project in the DreamCut Library.
 */
export const GENERATIONS_PROJECT_ID = "generations";

export const chatGenerationInputSchema = z.object({
  project_id: z.string().min(1).max(200).optional(),
  kind: z.enum(["image", "video", "music", "speech"]),
  prompt: z.string().max(12000).default(""),
  model: z.string().max(80).optional(),
  references: z.array(z.object({
    /** A file on this computer (absolute path, copied into the project) or project media (relative path). */
    path: z.string().min(1).max(1000),
    role: z.enum(["subject", "style", "composition", "edit", "start", "end", "motion", "source", "audio"]),
    label: z.string().max(200).optional(),
    start: z.number().min(0).max(36000).optional(),
    end: z.number().min(0).max(36000).optional(),
  }).strict()).max(16).default([]),
  aspect: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"]).optional(),
  duration: z.number().int().min(1).max(300).optional(),
  resolution: z.string().max(20).optional(),
  audio: z.boolean().optional(),
  count: z.number().int().min(1).max(4).optional(),
  lyrics: z.string().max(5000).optional(),
  voice: z.string().max(120).optional(),
  delivery: z.string().max(500).optional(),
}).strict();
export type ChatGenerationInput = z.infer<typeof chatGenerationInputSchema>;

const recordSchema = z.object({ draft: assetDraftSchema, credits: z.number().int().positive(), created_at: z.string() }).strict();
const draftPath = (projectId: string, draftId: string) => path.join(generationDir(projectId), "chat-drafts", `${z.uuid().parse(draftId)}.json`);
const MEDIA_FILE = /\.(png|jpe?g|webp|mp4|mov|webm|m4v|mp3|ogg|wav|m4a|aac)$/i;
const reviewUrl = (projectId: string, pane: "create" | "results") => `/p/${encodeURIComponent(projectId)}/library?generate=${pane}`;

function chatProject(projectId?: string) {
  if (projectId) { assertProject(projectId); return projectId; }
  if (!projectExists(GENERATIONS_PROJECT_ID)) createProject(GENERATIONS_PROJECT_ID, "web", "Generations");
  return GENERATIONS_PROJECT_ID;
}

/** Project media for each reference: local files are copied in (managed copy); project paths are checked. */
async function chatReferences(projectId: string, input: ChatGenerationInput): Promise<AssetDraft["references"]> {
  return Promise.all(input.references.map(async (ref, i) => {
    if (path.isAbsolute(ref.path) && !MEDIA_FILE.test(ref.path)) throw new Error(`${path.basename(ref.path)} is not a supported image, video or audio file.`);
    const source = path.isAbsolute(ref.path)
      ? ingestMediaPath({ projectId, sourcePath: ref.path, destinationDir: "references" }).media_path
      : ref.path;
    const file = resolveGenerationSource(projectId, source);
    const label = ref.label?.trim() || `${ROLE_LABELS[ref.role]} ${i + 1}`;
    if (!MEDIA_ROLES.includes(ref.role)) return { source, role: ref.role, label };
    const start = ref.start ?? 0, end = ref.end ?? Math.floor(await probeMediaDuration(file) * 100) / 100;
    return { source, role: ref.role, label, window: { start, end } };
  }));
}

function buildDraft(input: ChatGenerationInput, references: AssetDraft["references"]): AssetDraft {
  const modelId = input.model ?? defaultModelId(input.kind, references.map(r => r.role), input.lyrics);
  const base = assetDraftSchema.parse({ route: "fal", modelId, references });
  const model = getAssetModel(base);
  const kind = model.kind === "audio" ? "music" : model.kind;
  if (kind !== input.kind) throw new Error(`${model.name} makes ${kind}, not ${input.kind}.`);
  const defaults = input.model ? {} : qualityDefaults(modelId);
  const draft = assetDraftSchema.parse({
    ...base, prompt: input.prompt.trim(), lyrics: input.lyrics,
    ...(model.speech ? { voice: input.voice ?? (references.some(r => r.role === "audio") ? undefined : model.speech.defaultVoice), delivery: input.delivery } : {}),
    aspect: input.aspect ?? (model.kind === "image" ? "1:1" : model.aspects.includes("16:9") ? "16:9" : model.aspects[0]),
    duration: input.duration ?? (model.durations.includes(5) ? 5 : model.durations[0] ?? 5),
    resolution: input.resolution ?? defaults.resolution,
    audio: input.audio ?? defaults.audio ?? Boolean(model.audioRequired),
    count: input.count ?? 1,
  });
  const complete = { ...draft, task: modelTask(draft) };
  validateAssetRequest(complete);
  return complete;
}

/** Drafts a request, fills the Generate form with it and prices it. Copies local reference files into the project;
 * never generates or charges. The staged id doubles as the chat draft id. */
export async function draftChatGeneration(input: unknown, editorOrigin?: string) {
  const parsed = chatGenerationInputSchema.parse(input);
  const projectId = chatProject(parsed.project_id);
  const staged = await stageAssetDraft(projectId, buildDraft(parsed, await chatReferences(projectId, parsed)), { keepMarks: false });
  const { draft, stagedId: draftId } = staged, check = staged.check!;
  if (check.quote) writeJsonFileAtomic(draftPath(projectId, draftId), { draft, credits: check.quote.credits, created_at: new Date().toISOString() });
  const model = getAssetModel(draft);
  return {
    generated: false,
    draft_id: check.quote ? draftId : null,
    project_id: projectId,
    model: { id: model.id, name: model.name, chosen: parsed.model ? "requested" : "quality default" },
    request: { task: draft.task, prompt: draft.prompt, aspect: draft.aspect, ...(model.kind === "video" ? { duration: draft.duration, audio: draft.audio } : {}), ...(model.speech ? { voice: draft.voice ?? null, delivery: draft.delivery ?? null } : {}), resolution: draft.resolution ?? null, count: draft.count, references: draft.references.map(r => ({ role: r.role, label: r.label, source: r.source })) },
    price: check.quote ? { credits: check.quote.credits } : null,
    balance: check.balance,
    readiness: check.readiness,
    message: check.message,
    guidance: READINESS_GUIDANCE[check.readiness],
    ...(check.readiness === "sign_in" ? { sign_in_url: chatSignInUrl(editorOrigin) } : {}),
    ...(check.readiness === "buy_credits" ? { buy_credits_url: BUY_CREDITS_URL } : {}),
    prompt_guide: promptGuide(draft),
    review_url: reviewUrl(projectId, "create"),
    next_action: "Open review_url in the creator's editor: the Generate form shows this prompt, model and settings. Tell them the model and price in credits. They generate by clicking Generate, or by approving in chat: then call generate_media again with this draft_id, project_id and their words. To change the prompt, draft again.",
  };
}

/** One job per approved draft, so a repeated approval never charges twice. */
function jobId(projectId: string, draftId: string) {
  const hex = createHash("sha256").update(`chat\n${projectId}\n${draftId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Generates a drafted request after the creator approved its price in chat. Refuses (no charge) when the price
 * moved, they are signed out or short of credits. */
export async function approveChatGeneration(input: { project_id: string; draft_id: string; approval: string }, editorOrigin?: string) {
  const projectId = input.project_id;
  assertProject(projectId);
  const approval = input.approval?.trim() ?? "";
  if (!approval) throw new DraftSubmitRefusal("approval_required", "Quote the creator's own words approving this draft and price. A request to generate before they saw the price is not approval.");
  const file = draftPath(projectId, input.draft_id);
  if (!fs.existsSync(file)) throw new DraftSubmitRefusal("unknown_draft", "No draft with that id. Draft again with generate_media and show the creator the price.");
  const record = recordSchema.parse(readJsonFile(file, null));
  const id = jobId(projectId, input.draft_id);
  const started = (jobIdToShow = id) => {
    const job = readAssetJob(projectId, jobIdToShow);
    return { job: { id: job.id, status: job.status, credits: job.quote && "credits" in job.quote ? job.quote.credits : record.credits }, project_id: projectId, review_url: reviewUrl(projectId, "results"),
      next_action: "Call asset_generation_status with this project_id and job_id (wait_seconds up to 120) to show the results in chat." };
  };
  // Approving the same draft again returns its job without re-checking a balance it already spent.
  if (fs.existsSync(jobPath(projectId, id))) return { ...started(), already_submitted: true };
  // The creator saw this draft in the Generate form: generate what the form holds, which refuses if they edited it
  // since and returns their own Generate click rather than charging twice.
  if (stagedDraftShown(projectId, input.draft_id)) {
    const { job, already_submitted } = await submitStagedDraft(projectId, { staged_id: input.draft_id, approval }, editorOrigin);
    return { ...started(job.id), already_submitted };
  }
  const check = await checkGeneration(record.draft);
  const state = { draft_id: input.draft_id, project_id: projectId, credits: check.quote?.credits ?? null, balance: check.balance, readiness: check.readiness };
  if (check.quote && check.quote.credits !== record.credits) {
    writeJsonFileAtomic(file, { ...record, credits: check.quote.credits });
    throw new DraftSubmitRefusal("price_changed", `The price changed from ${record.credits} to ${check.quote.credits} credits. Show the creator the new price and ask again.`, state);
  }
  if (check.readiness === "sign_in") throw new DraftSubmitRefusal("sign_in", READINESS_GUIDANCE.sign_in, { ...state, sign_in_url: chatSignInUrl(editorOrigin) });
  if (check.readiness === "buy_credits") throw new DraftSubmitRefusal("buy_credits", `This costs ${record.credits} credits and the balance is ${check.balance}. ${READINESS_GUIDANCE.buy_credits}`, { ...state, buy_credits_url: BUY_CREDITS_URL });
  if (check.readiness !== "ready") throw new DraftSubmitRefusal(check.readiness, check.message ?? "This draft can't be generated right now.", state);
  await createAssetJob(projectId, record.draft, id, record.credits, { source: "chat", words: approval.slice(0, 2000), staged_id: input.draft_id, recorded_at: new Date().toISOString() });
  return { ...started(), already_submitted: false };
}
