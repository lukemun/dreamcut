/**
 * DreamCut Cloud generation client (`/api/v1` on dreamcut.io; shapes from `site/src/lib/{catalog,drafts,jobs}.ts`).
 * Quoting is free and needs no account. Only `createCloudGeneration` spends credits, and only the asset worker
 * calls it, for a request the creator created with the Generate click. Staging a draft never reaches it.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { cloudBaseUrl } from "@/lib/cloud/base-url";
import { CloudSignedOutError, cloudFetch, type Fetcher } from "@/lib/local-store/cloud-account";
import type { AssetDraft } from "./assets";
import { cloudUnavailableMessage, getAssetModel, windowSeconds } from "./asset-models";

/** Cloud reference uploads (`site/src/app/api/v1/uploads`): PNG, JPEG or WebP up to 10 MB; video and audio are sent
 * as the normalized MP4 or WAV the worker prepares, up to 200 MB. */
export const CLOUD_REFERENCE_MAX_BYTES = 10 * 1024 * 1024;
export const CLOUD_MEDIA_REFERENCE_MAX_BYTES = 200 * 1024 * 1024;
const REFERENCE_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".wav": "audio/wav" };

/** A Cloud API refusal. `code` is the API's `error` field (for example `insufficient_credits`, `price_changed`). */
export class CloudApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); }
}
/** The request may or may not have reached the Cloud (network failure or 5xx). Safe to repeat with the same id. */
export class CloudUnreachableError extends Error {}

async function readCloud(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null) as { error?: unknown; message?: unknown } | null;
  if (response.ok) return body;
  const code = typeof body?.error === "string" ? body.error : "http_error";
  const message = typeof body?.message === "string" && body.message !== code ? body.message : `DreamCut Cloud returned HTTP ${response.status}.`;
  if (response.status >= 500) throw new CloudUnreachableError(message);
  throw new CloudApiError(message, response.status, code);
}
async function send(call: () => Promise<Response>): Promise<unknown> {
  let response: Response;
  try { response = await call(); }
  catch (error) {
    if (error instanceof CloudSignedOutError) throw error;
    throw new CloudUnreachableError("DreamCut Cloud is unreachable. Check your connection.");
  }
  return readCloud(response);
}

/**
 * The Cloud draft for a local draft. `paths[i]` is the uploaded Cloud path of `draft.references[i]` (empty when
 * quoting). Video and audio references declare their window's length, which the price uses and the Cloud checks.
 */
export function cloudDraft(draft: AssetDraft, paths: readonly string[] = []) {
  const model = getAssetModel(draft);
  if (model.cloud === false) throw new Error(cloudUnavailableMessage(model.name));
  const settings = Object.fromEntries(Object.entries(draft.settings ?? {}).filter(([, value]) => value !== undefined));
  return {
    modelId: model.id, prompt: draft.prompt.trim(), aspect: draft.aspect, count: draft.count,
    ...(model.kind !== "image" ? { duration: draft.duration, audio: draft.audio } : {}),
    ...(model.resolutions.length && draft.resolution ? { resolution: draft.resolution } : {}),
    ...(model.adapter === "motion" ? { orientation: draft.orientation } : {}),
    ...(model.lyrics && draft.lyrics?.trim() ? { lyrics: draft.lyrics.trim() } : {}),
    ...(model.speech && draft.voice ? { voice: draft.voice } : {}),
    ...(model.speech?.delivery && draft.delivery?.trim() ? { delivery: draft.delivery.trim() } : {}),
    ...(Object.keys(settings).length ? { settings } : {}),
    references: draft.references.map((ref, i) => ({ role: ref.role, path: paths[i] ?? "", ...(ref.window ? { duration: windowSeconds(ref) } : {}) })),
  };
}

const quoteSchema = z.object({ credits: z.number().int().positive(), catalogVersion: z.string().min(1).max(80) });
export type CloudQuote = z.infer<typeof quoteSchema>;
/** Prices a draft in credits. No sign-in and no charge. */
export async function quoteCloudDraft(draft: AssetDraft, fetcher: Fetcher = fetch): Promise<CloudQuote> {
  const body = JSON.stringify({ draft: cloudDraft(draft) });
  return quoteSchema.parse(await send(() => fetcher(`${cloudBaseUrl()}/api/v1/quotes`, {
    method: "POST", headers: { "Content-Type": "application/json", accept: "application/json" }, body, signal: AbortSignal.timeout(15_000),
  })));
}

const meSchema = z.object({ credits: z.number().int(), email: z.string().nullish() });
/** The signed-in account's credit balance. Throws CloudSignedOutError when signed out. */
export async function cloudCreditBalance(fetcher: Fetcher = fetch) {
  return meSchema.parse(await send(() => cloudFetch("/api/v1/me", {}, fetcher))).credits;
}

/** Hosts the Cloud hands out for reference uploads and result downloads. */
export function cloudMediaUrl(value: string) {
  const url = new URL(value), base = new URL(cloudBaseUrl());
  const loopbackBase = ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname);
  const host = url.hostname;
  // Matches the Cloud's own output allowlist (site/src/lib/fal.ts): when the Cloud can't keep a copy it
  // returns the provider URL, which may be on fal.run.
  const allowedHost = host.endsWith(".supabase.co") || host === "fal.media" || host.endsWith(".fal.media")
    || host === "fal.run" || host.endsWith(".fal.run")
    || (host === "storage.googleapis.com" && url.pathname.startsWith("/falserverless/")) || url.host === base.host;
  const allowedProtocol = url.protocol === "https:" || (loopbackBase && url.protocol === "http:" && url.host === base.host);
  if (url.username || url.password || !allowedHost || !allowedProtocol) throw new Error("DreamCut Cloud returned an unexpected media address.");
  return url.toString();
}

const ticketSchema = z.object({ path: z.string().min(1).max(400), uploadUrl: z.string().url() });
/** Uploads one reference for this request and returns its Cloud path. Repeating it overwrites the same path. */
export async function uploadCloudReference(clientRequestId: string, file: string, fetcher: Fetcher = fetch) {
  const contentType = REFERENCE_TYPES[path.extname(file).toLowerCase()];
  if (!contentType) throw new CloudApiError("DreamCut models accept PNG, JPEG or WebP images, MP4 video and WAV audio.", 400, "invalid_upload");
  const bytes = fs.readFileSync(file), image = contentType.startsWith("image/");
  if (bytes.length > (image ? CLOUD_REFERENCE_MAX_BYTES : CLOUD_MEDIA_REFERENCE_MAX_BYTES)) throw new CloudApiError(image ? "Image references must be under 10 MB." : "Video and audio references must be under 200 MB. Use a shorter part.", 400, "invalid_upload");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const ticket = ticketSchema.parse(await send(() => cloudFetch("/api/v1/uploads", {
    method: "POST", body: JSON.stringify({ clientRequestId, sha256, contentType, bytes: bytes.length }),
  }, fetcher)));
  let put: Response;
  try {
    put = await fetcher(cloudMediaUrl(ticket.uploadUrl), {
      method: "PUT", headers: { "Content-Type": contentType, "x-upsert": "true" }, body: new Uint8Array(bytes),
      redirect: "error", signal: AbortSignal.timeout(5 * 60_000 + Math.ceil(bytes.length / (10 * 1024 * 1024)) * 60_000),
    });
  } catch { throw new CloudUnreachableError("A reference upload was interrupted."); }
  if (!put.ok) throw new CloudUnreachableError(`A reference upload failed (HTTP ${put.status}).`);
  return ticket.path;
}

const generationSchema = z.object({
  id: z.string().min(1).max(80),
  clientRequestId: z.string().optional(),
  credits: z.number().int().nonnegative(),
  status: z.string(),
  error: z.string().nullish(),
  outputs: z.array(z.object({ url: z.string().url(), contentType: z.string(), bytes: z.number().nullish() })).default([]),
  mediaExpiresAt: z.string().nullish(),
});
export type CloudGeneration = z.infer<typeof generationSchema>;
const generationPath = (id: string) => `/api/v1/generations/${encodeURIComponent(z.string().min(1).max(80).regex(/^[A-Za-z0-9-]+$/).parse(id))}`;

/** Charges credits and queues the generation. The same clientRequestId always returns the same Cloud job. */
export async function createCloudGeneration(input: { clientRequestId: string; draft: ReturnType<typeof cloudDraft>; acceptedCredits: number }, fetcher: Fetcher = fetch) {
  return generationSchema.parse(await send(() => cloudFetch("/api/v1/generations", { method: "POST", body: JSON.stringify(input) }, fetcher)));
}
export async function getCloudGeneration(id: string, fetcher: Fetcher = fetch) {
  return generationSchema.parse(await send(() => cloudFetch(generationPath(id), {}, fetcher)));
}
/** Finds this computer's request among the account's recent generations (used when a create had no answer). */
export async function findCloudGeneration(clientRequestId: string, fetcher: Fetcher = fetch) {
  const body = z.object({ generations: z.array(generationSchema) }).parse(await send(() => cloudFetch("/api/v1/generations", {}, fetcher)));
  return body.generations.find(g => g.clientRequestId === clientRequestId) ?? null;
}
/** Cancels a generation that has not reached the model yet; the Cloud refunds it. 409 `already_started` otherwise. */
export async function cancelCloudGeneration(id: string, fetcher: Fetcher = fetch) {
  return z.object({ canceled: z.boolean(), refundedCredits: z.number().int().nonnegative().optional() })
    .parse(await send(() => cloudFetch(`${generationPath(id)}/cancel`, { method: "POST" }, fetcher)));
}
/** Records that the outputs are saved locally. The Cloud keeps its copy in the account either way. */
export async function acknowledgeCloudGeneration(id: string, fetcher: Fetcher = fetch) {
  await send(() => cloudFetch(`${generationPath(id)}/ack`, { method: "POST" }, fetcher));
}

const OUTPUT_EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/mpeg": "mp3", "audio/mp3": "mp3" };
export function cloudOutputExtension(contentType: string) {
  const extension = OUTPUT_EXTENSIONS[contentType.split(";")[0].trim().toLowerCase()];
  if (!extension) throw new Error(`DreamCut Cloud returned an unsupported result type (${contentType.slice(0, 60)}).`);
  return extension;
}
