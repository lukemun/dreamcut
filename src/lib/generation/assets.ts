import { z } from "zod";
import { modelEstimate, modelPayload, validateModelDraft } from "./asset-models";

export const assetTaskSchema = z.enum(["image", "edit", "video", "animate", "motion", "recast", "music", "speech", "extract"]);
export type AssetTask = z.infer<typeof assetTaskSchema>;
export const TASK_LABELS: Record<AssetTask, string> = { image: "Create image", edit: "Edit image", video: "Create video", animate: "Animate image", motion: "Copy motion", recast: "Recast video", music: "Create music", speech: "Create voiceover", extract: "Extract frames" };
/** `window`: the part of a video or audio reference to send, in seconds on its own clock; image references have none. */
export const referenceWindowSchema = z.object({ start: z.number().min(0).max(36000), end: z.number().min(0).max(36000) }).strict().refine(w => w.end > w.start, "A time range must end after it starts");
export const referenceSchema = z.object({ source: z.string().min(1).max(600), role: z.enum(["subject", "style", "composition", "edit", "start", "end", "motion", "source", "audio"]), label: z.string().max(200), window: referenceWindowSchema.optional() }).strict();
/**
 * A creator's point mark on a reference or result: "this", plus what to change.
 * Marks guide prompt revision with the agent; they are not sent to providers.
 */
export const generationMarkSchema = z.object({
  id: z.string().min(1).max(64), source: z.string().min(1).max(600),
  // A point (x/y in 0–1 of the media box) and/or a video moment; a mark may be a whole image.
  x: z.number().min(0).max(1).optional(), y: z.number().min(0).max(1).optional(), time: z.number().min(0).max(3600).optional(),
  note: z.string().max(500).default(""),
  /** Visible name at marking time, e.g. a Library title; the source stays authoritative. */
  label: z.string().max(200).optional(),
}).strict();
export type GenerationMark = z.infer<typeof generationMarkSchema>;
/** `route`: "fal" = the models sold through DreamCut Cloud and paid with credits (the stored value predates Cloud);
 * "local" = frame extraction. Drafts saved with the retired "codex" route (Codex image tool) open as DreamCut models. */
const assetDraftObject = z.object({
  task: assetTaskSchema.default("image"), route: z.enum(["fal", "local"]).default("fal"),
  modelId: z.string().max(80).optional(), resolution: z.string().max(20).optional(),
  intent: z.string().max(4000).optional(),
  settings: z.object({
    negativePrompt: z.string().max(2500).optional(),
    cfgScale: z.number().min(0).max(1).optional(),
    seed: z.number().int().min(0).max(2147483647).optional(),
    promptExpansion: z.enum(["disabled", "balanced", "quality"]).optional(),
    enableSafetyChecker: z.boolean().optional(),
    autoFix: z.boolean().optional(),
    safetyTolerance: z.enum(["1", "2", "3", "4", "5", "6"]).optional(),
    bitrateMode: z.enum(["standard", "high"]).optional(),
    enhanceRealism: z.boolean().optional(),
  }).strict().optional(),
  prompt: z.string().max(12000).default(""), references: z.array(referenceSchema).max(16).default([]),
  /** Words to sing, for music models. */
  lyrics: z.string().max(5000).optional(),
  /** Voiceover models: the voice id (`voices.ts`), and delivery directions where the model takes them apart from the script. */
  voice: z.string().max(120).optional(),
  delivery: z.string().max(500).optional(),
  aspect: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"]).default("1:1"), count: z.number().int().min(1).max(24).default(1),
  duration: z.number().int().min(1).max(300).default(5), audio: z.boolean().default(false),
  orientation: z.enum(["image", "video"]).default("video"),
  start: z.number().min(0).max(3600).default(0), end: z.number().min(0).max(3600).default(2),
  timestamps: z.array(z.number().min(0).max(3600)).max(24).default([]),
  parentJobId: z.string().uuid().optional(),
  marks: z.array(generationMarkSchema).max(40).default([]),
}).strict();
/** A draft saved for the retired Codex image tool (GPT Image) opens as GPT Image 2.5, a DreamCut model, with its own settings. */
const openLegacyCodexDraft = (value: unknown) => value && typeof value === "object" && (value as { route?: unknown }).route === "codex"
  ? { ...value, route: "fal", modelId: "gpt-image-2.5", resolution: undefined, audio: false, settings: undefined } : value;
export const assetDraftSchema = z.preprocess(openLegacyCodexDraft, assetDraftObject);
export type AssetDraft = z.infer<typeof assetDraftSchema>;
export const EMPTY_ASSET_DRAFT: AssetDraft = assetDraftSchema.parse({});
export const referenceSetSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(100), references: z.array(referenceSchema).max(16) });
export type ReferenceSet = z.infer<typeof referenceSetSchema>;

/** Provider-price reference in US dollars, kept in step with the Cloud catalog. Creators see credits instead. */
export type UsdEstimate = { usd: number; checkedAt: string; source: string; kind: "estimate" };
/** The DreamCut Cloud price the creator accepted with Generate. */
export type CreditQuote = { credits: number; catalogVersion: string; kind: "credits" };
export function estimateAssetCost(draft: AssetDraft, motionDuration?: number): UsdEstimate | null {
  return draft.route === "fal" && draft.task !== "extract" ? modelEstimate(draft, motionDuration) : null;
}
export function validateAssetRequest(draft: AssetDraft) {
  const roles = draft.references.map(r => r.role);
  if (draft.task === "extract") {
    if (draft.route !== "local" || draft.references.length !== 1 || roles[0] !== "source") throw new Error("Choose one source video for local extraction.");
    if (!draft.timestamps.length && draft.end <= draft.start) throw new Error("End must be after start.");
    return;
  }
  if (draft.route === "local") throw new Error("Choose a DreamCut model for generation.");
  validateModelDraft(draft);
}
/** `referenceUrls`: one URL per reference, aligned with `draft.references`, or a role → URL record. */
export function buildFalAssetInput(draft: AssetDraft, referenceUrls: readonly string[] | Record<string, string>) {
  validateAssetRequest(draft);
  if (draft.route !== "fal") throw new Error("Only DreamCut model requests have provider payloads.");
  return modelPayload(draft, referenceUrls);
}
/** Cloud-side state of a request sent with DreamCut credits. `clientRequestId` is the local job id, so repeating
 * the create call returns the same Cloud job instead of charging again. */
export type CloudJobState = {
  clientRequestId: string;
  /** Reference index → Cloud storage path, recorded after each upload so a resume skips finished uploads.
   * Requests recorded before several references per role keyed this by role. */
  uploads?: Record<string, string>;
  /** Set before the first create call; from then on the Cloud may hold this request. */
  createSentAt?: string;
  generationId?: string;
  /** True when the request ended for good (price changed, rejected, failed or expired); a new Generate is needed. */
  final?: boolean;
  insufficientCredits?: boolean;
  cancelRefused?: boolean;
  refundedCredits?: number;
  downloadedAt?: string;
  acknowledgedAt?: string;
  ackPending?: boolean;
};
export type GenerationApproval = { source: "generate_button" | "chat"; recorded_at: string; words?: string; staged_id?: string };
/** Generation runs only through DreamCut Cloud, paid with credits. Requests recorded before 2026-10-27 may carry the
 * retired `fal_development` (a direct fal.ai call) or no transport (direct fal); the worker refuses both. */
export type AssetTransport = "cloud";
export type AssetOutput = { id: string; source: string; kind: "image" | "video" | "audio"; sha256: string; frameIndex?: number; timestamp?: number; assetId?: string; keptSource?: string; annotation?: string; annotationStatus?: string };
export type AssetJob = {
  id: string; projectId: string; createdAt: string; updatedAt: string; request: AssetDraft;
  status: "queued" | "submitting" | "running" | "saving" | "ready" | "failed" | "uncertain" | "canceled";
  references: Array<AssetDraft["references"][number] & { sha256: string }>;
  catalogVersion?: string; resolvedInput?: Record<string, unknown>; model?: string; quote: UsdEstimate | CreditQuote | null; outputs: AssetOutput[];
  transport?: AssetTransport; cloud?: CloudJobState;
  /** Who authorized this request: the creator's Generate click, or their own words approving it in chat. */
  approval?: GenerationApproval;
  provider?: { requestId: string; statusUrl: string; responseUrl: string; cancelUrl: string };
  uploadedReferenceUrls?: Record<string, string>;
  resultUrls?: string[]; error?: string; cancelRequested?: boolean; workerPid?: number;
  progress?: { providerStatus: string; checkedAt: string; queuePosition?: number; phase?: "downloading" | "verifying"; downloadedBytes?: number; totalBytes?: number; outputIndex?: number; outputCount?: number };
};
export type GenerationAsset = { source: string; name: string; kind: "image" | "video" | "audio"; preview?: string; preparation?: string; duration?: number; jobId?: string };
export const ACTIVE_ASSET_STATUSES = ["queued", "submitting", "running", "saving"];
/** Whether "resume" can continue this same request without a second charge. */
export function canResumeAssetJob(job: Pick<AssetJob, "status" | "cloud" | "request">) {
  if (job.cloud) return (job.status === "failed" || job.status === "uncertain") && !job.cloud.final;
  return job.status === "failed" && job.request.route === "local";
}
export const assetMediaUrl = (projectId: string, source: string) => `/api/projects/${encodeURIComponent(projectId)}/media/${source.split("/").map(encodeURIComponent).join("/")}`;
export function chooseFrameIndices(times: number[], start: number, end: number, count: number, explicit: number[] = []) {
  if (!times.length) throw new Error("Video has no decodable frames.");
  const targets = explicit.length ? explicit : Array.from({ length: count }, (_, i) => count === 1 ? start : start + (end - start) * i / (count - 1));
  if (targets.some(t => t < times[0] - 0.001 || t > times[times.length - 1] + 0.001)) throw new Error("Selected time is outside the video's frame range.");
  return [...new Set(targets.map(t => {
    let low = 0, high = times.length - 1;
    while (low < high) { const mid = Math.floor((low + high) / 2); if (times[mid] < t) low = mid + 1; else high = mid; }
    return low > 0 && Math.abs(times[low - 1] - t) <= Math.abs(times[low] - t) ? low - 1 : low;
  }))].sort((a, b) => a - b);
}

/** File extensions match the upload endpoint; browser MIME metadata may be empty. */
export function generationUploadReference(name: string, supportedRoles: readonly AssetDraft["references"][number]["role"][], references: AssetDraft["references"]) {
  const video = /\.(mp4|mov|webm|m4v)$/i.test(name);
  const audio = /\.(mp3|ogg|wav|m4a|aac)$/i.test(name);
  if (!video && !audio && !/\.(png|jpe?g|webp)$/i.test(name)) throw new Error("Choose an image, video, or audio file.");
  const roles = supportedRoles.filter(role => audio ? role === "audio" : video ? role === "motion" || role === "source" : role !== "motion" && role !== "source" && role !== "audio");
  const role = roles.find(role => !references.some(ref => ref.role === role)) ?? roles[0];
  if (!role) throw new Error(`This model does not accept ${audio ? "audio" : video ? "video" : "image"} references.`);
  return { assetType: audio ? "music" as const : video ? "video_clip" as const : "still" as const, role };
}
