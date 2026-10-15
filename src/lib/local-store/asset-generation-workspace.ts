import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { assetDraftSchema, referenceSetSchema, validateAssetRequest, type AssetDraft } from "../generation/assets";
import { modelTask } from "../generation/asset-models";
import { checkGeneration, type GenerationCheck } from "../generation/cloud-readiness";
import { createAssetJob, generationDir, listAssetJobs, resolveGenerationSource } from "./asset-generation";
import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";
import { assertProject } from "./store";
import { BUY_CREDITS_URL } from "@/lib/cloud/base-url";

export const assetWorkspaceSchema = z.object({
  draft: assetDraftSchema,
  referenceSets: z.array(referenceSetSchema).max(30),
  modelDrafts: z.record(z.string().max(80), assetDraftSchema).optional(),
  stagedId: z.uuid().optional(),
}).strict();
export function readAssetWorkspace(projectId: string) {
  assertProject(projectId);
  return assetWorkspaceSchema.parse(readJsonFile(path.join(generationDir(projectId), "workspace.json"), { draft: {}, referenceSets: [] }));
}
export function saveAssetWorkspace(projectId: string, input: unknown) {
  const next = assetWorkspaceSchema.parse(input), current = readAssetWorkspace(projectId);
  // Synchronous read/check/write prevents an older browser autosave from erasing an agent handoff.
  if (next.stagedId !== current.stagedId) throw new Error("A new generation draft is ready. Reload it before saving.");
  writeJsonFileAtomic(path.join(generationDir(projectId), "workspace.json"), next);
}
const READINESS_GUIDANCE: Record<GenerationCheck["readiness"], string> = {
  ready: "The creator can review the draft and click Generate; that click spends the quoted credits.",
  sign_in: "The creator is signed out. Tell them the Generate form offers \"Sign in or create account\"; the draft stays in place while they sign in.",
  buy_credits: "The balance does not cover this price. Tell the creator to buy credits from the Generate form; it re-checks when they return.",
  model_unavailable: "This model is not sold with DreamCut credits. Restage with a supported model.",
  incomplete: "The draft is incomplete for this model; fix the reported problem and restage.",
  price_unavailable: "DreamCut Cloud could not price the draft right now (offline?). The Generate form retries.",
};
/** Fills the visible Generate form for review. Never creates a job, uploads references or spends credits;
 * for DreamCut models it reports the price, sign-in and balance so the agent can guide the creator. */
export async function prepareAssetWorkspace(projectId: string, input: unknown) {
  const parsed = assetDraftSchema.parse(input);
  if (parsed.task === "extract") throw new Error("Use the frame extraction tool for extraction.");
  validateAssetRequest(parsed);
  parsed.references.forEach(ref => resolveGenerationSource(projectId, ref.source));
  const previous = readAssetWorkspace(projectId), stagedId = randomUUID();
  // The creator's marks survive an agent revision unless the agent restates them.
  const draft = { ...parsed, marks: parsed.marks.length ? parsed.marks : previous.draft.marks ?? [] };
  const workspace = { ...previous, draft, stagedId };
  // Retain the previous composer contents for recovery; never create a provider job here.
  writeJsonFileAtomic(path.join(generationDir(projectId), `draft-${stagedId}.json`), { previous, workspace });
  writeJsonFileAtomic(path.join(generationDir(projectId), "workspace.json"), workspace);
  const check = draft.route === "fal" ? await checkGeneration(draft) : null;
  recordAgentView(projectId, stagedId, draft, check?.quote?.credits ?? null);
  return {
    workspace, generated: false,
    estimate: check?.quote ? { credits: check.quote.credits, catalog_version: check.quote.catalogVersion } : null,
    ...(check ? { generation_check: { readiness: check.readiness, signed_in: check.signed_in, balance: check.balance, message: check.message, buy_credits_url: check.buy_credits_url, guidance: READINESS_GUIDANCE[check.readiness] } } : {}),
    staged_id: stagedId,
    review_url: `/p/${encodeURIComponent(projectId)}/library?generate=create`,
    next_action: "human_review" as const,
    submission_policy: "The exact visible draft is ready for review. Do not generate or click Generate without explicit user approval.",
  };
}

// ── Review record: what the editor displayed and what the agent last showed the creator ──────────────────────────
const reviewFile = (projectId: string) => path.join(generationDir(projectId), "draft-review.json");
const reviewSchema = z.object({
  /** The staged draft an open Generate form displayed. */
  viewed: z.object({ stagedId: z.uuid(), at: z.string() }).optional(),
  /** The exact draft (fingerprint) and price the agent last reported to the creator. */
  agent: z.object({ stagedId: z.uuid(), fingerprint: z.string(), credits: z.number().nullable(), at: z.string() }).optional(),
}).strict();
const readReview = (projectId: string) => reviewSchema.parse(readJsonFile(reviewFile(projectId), {}));
const writeReview = (projectId: string, patch: z.infer<typeof reviewSchema>) => writeJsonFileAtomic(reviewFile(projectId), { ...readReview(projectId), ...patch });

/** The draft as it would be sent: notes and marks for the agent do not change what is generated. */
export function generationRequest(draft: AssetDraft): AssetDraft {
  return draft.route === "fal" ? { ...draft, task: modelTask(draft) } : draft;
}
export function draftFingerprint(draft: AssetDraft) {
  const { marks: _marks, intent: _intent, parentJobId: _parent, ...generated } = generationRequest(draft);
  return createHash("sha256").update(JSON.stringify(generated)).digest("hex");
}
function recordAgentView(projectId: string, stagedId: string, draft: AssetDraft, credits: number | null) {
  writeReview(projectId, { agent: { stagedId, fingerprint: draftFingerprint(draft), credits, at: new Date().toISOString() } });
}
/** Called by an open Generate form when it shows a staged draft to the creator. */
export function markStagedDraftViewed(projectId: string, stagedId: string) {
  assertProject(projectId);
  if (readAssetWorkspace(projectId).stagedId !== stagedId) throw new Error("A newer generation draft is staged.");
  writeReview(projectId, { viewed: { stagedId, at: new Date().toISOString() } });
}

export class DraftSubmitRefusal extends Error {
  constructor(readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
}
/** A request id fixed by project, staging and exact draft: submitting the same approved draft twice is one job. */
function submissionId(projectId: string, stagedId: string, fingerprint: string) {
  const hex = createHash("sha256").update(`${projectId}\n${stagedId}\n${fingerprint}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Generates the draft currently in the Generate form after the creator approved it in chat. `approval` is the
 * creator's own words and is stored with the job. Refuses (no charge) when the form changed since the agent last
 * reported it, when no open form displayed it, when signed out or short of credits.
 */
export async function submitStagedDraft(projectId: string, input: { staged_id: string; approval: string }) {
  assertProject(projectId);
  const approval = input.approval?.trim() ?? "";
  if (!approval) throw new DraftSubmitRefusal("approval_required", "Quote the creator's explicit approval to generate. A request to prepare a draft is not approval.");
  const workspace = readAssetWorkspace(projectId);
  const draft = generationRequest(workspace.draft);
  const review = readReview(projectId);
  const current = async () => {
    const check = draft.route === "fal" ? await checkGeneration(draft) : null;
    return { staged_id: workspace.stagedId ?? null, draft, credits: check?.quote?.credits ?? null, readiness: check?.readiness ?? null, balance: check?.balance ?? null, review_url: `/p/${encodeURIComponent(projectId)}/library?generate=create` };
  };
  if (!workspace.stagedId || workspace.stagedId !== input.staged_id) {
    throw new DraftSubmitRefusal("stale_draft", "The Generate form holds a different draft. Show the creator the current draft and price and ask again.", await current());
  }
  if (review.viewed?.stagedId !== workspace.stagedId) {
    throw new DraftSubmitRefusal("not_viewed", "The creator has not had this draft open in Generate. Open the review_url for them and ask again once they have seen it.", await current());
  }
  if (draft.route !== "fal") throw new DraftSubmitRefusal("unsupported_route", "Chat approval generates DreamCut models only. GPT Image drafts use the Codex image handoff in the Generate form.");
  const fingerprint = draftFingerprint(draft);
  const state = await current();
  if (review.agent?.stagedId !== workspace.stagedId || review.agent.fingerprint !== fingerprint || review.agent.credits !== state.credits) {
    // The creator edited the form (or the price moved) after the agent reported it. Report it now and refuse.
    recordAgentView(projectId, workspace.stagedId, draft, state.credits);
    throw new DraftSubmitRefusal("draft_changed", "The draft or its price changed since you last showed it. Show the creator this draft and price and ask again.", state);
  }
  if (state.readiness === "sign_in") throw new DraftSubmitRefusal("sign_in", "The creator is signed out. Ask them to use Sign in or create account in the Generate form, then ask again.", state);
  if (state.readiness === "buy_credits") throw new DraftSubmitRefusal("buy_credits", `This costs ${state.credits} credits and the balance is ${state.balance}. Ask the creator to buy credits first.`, { ...state, buy_credits_url: BUY_CREDITS_URL });
  if (state.readiness !== "ready" || state.credits === null) throw new DraftSubmitRefusal(state.readiness ?? "not_ready", "This draft can't be generated yet. Report the problem shown in the Generate form.", state);
  // The creator may already have clicked Generate for this exact draft: never generate it twice.
  const id = submissionId(projectId, workspace.stagedId, fingerprint);
  const existing = listAssetJobs(projectId).find(job => job.id === id);
  if (existing) return { job: existing, already_submitted: true };
  const clicked = listAssetJobs(projectId).find(job => job.id !== id && job.createdAt >= (review.viewed?.at ?? "") && draftFingerprint(job.request) === fingerprint && !["failed", "canceled"].includes(job.status));
  if (clicked) return { job: clicked, already_submitted: true };
  const job = await createAssetJob(projectId, draft, id, state.credits, { source: "chat", words: approval.slice(0, 2000), staged_id: workspace.stagedId, recorded_at: new Date().toISOString() });
  return { job, already_submitted: false };
}
