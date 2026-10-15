import fs from "node:fs";
import { buildFalAssetInput, chooseFrameIndices, type AssetJob, type CloudJobState } from "./assets";
import { readAssetJob, updateAssetJob, withAssetJobLock, jobPath, stageFile, outputFromFile, resolveGenerationSource, hashAsset, probeGenerationSource, execMedia, assetContentType } from "../local-store/asset-generation";
import { developmentFalKey } from "./development-fal-key";
import { CloudSignedOutError } from "../local-store/cloud-account";
import {
  CloudApiError, acknowledgeCloudGeneration, cancelCloudGeneration, cloudDraft, cloudMediaUrl, cloudOutputExtension,
  createCloudGeneration, findCloudGeneration, getCloudGeneration, uploadCloudReference, type CloudGeneration,
} from "./cloud-generation";
import { referenceUploadFile, releaseReferenceFile, releaseReferenceScratch } from "./reference-media";

export function falProviderUrl(value: string) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.hostname !== "queue.fal.run" || u.username || u.password || u.port) throw new Error("Unexpected fal queue URL.");
  return u.toString();
}
export function falOutputUrl(value: string) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || u.port || !(u.hostname === "fal.media" || u.hostname.endsWith(".fal.media") || (u.hostname === "storage.googleapis.com" && u.pathname.startsWith("/falserverless/")))) throw new Error("Unexpected output host. Result retained for inspection.");
  return u.toString();
}
/** Development-only direct fal transport (see development-fal-key.ts). Product requests use runCloud. */
async function falRequest(url: string, method = "GET", body?: unknown) {
  const key = developmentFalKey();
  if (!key) throw new Error("This request was sent directly to fal.ai, which DreamCut no longer does. Generate it again to use DreamCut credits.");
  const response = await fetch(falProviderUrl(url), { method, redirect: "error", headers: { Authorization: `Key ${key}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`fal.ai returned ${response.status}. Check this request in fal.ai before starting another paid generation.`);
  return response.json();
}
async function downloadOutput(url: string, file: string, onProgress: (bytes: number, total?: number) => Promise<void>) {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(180000) });
  if (!response.ok || !response.body) throw new Error(`Output download failed (${response.status}). Resume to download the same result.`);
  const tmp = `${file}.partial`;
  let bytes = 0, lastUpdate = 0;
  const length = Number(response.headers.get("content-length"));
  const total = Number.isFinite(length) && length > 0 ? length : undefined;
  await onProgress(0, total);
  const fd = fs.openSync(tmp, "w", 0o600);
  const reader = response.body.getReader();
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 512 * 1024 * 1024) throw new Error("Generated output exceeds 512 MB."); fs.writeSync(fd, value); if (Date.now() - lastUpdate >= 1000) { await onProgress(bytes, total); lastUpdate = Date.now(); } }
  } finally { await reader.cancel(); fs.closeSync(fd); }
  fs.renameSync(tmp, file);
  await onProgress(bytes, total);
}
async function extract(job: AssetJob) {
  const file = resolveGenerationSource(job.projectId, job.references[0].source);
  const probe = await probeGenerationSource(file, true);
  const indices = chooseFrameIndices(probe.times, job.request.start, job.request.end, job.request.count, job.request.timestamps);
  const pattern = stageFile(job.projectId, job.id, "frame-%03d.png");
  const selection = indices.map(n => `eq(n\\,${n})`).join("+");
  await execMedia("ffmpeg", ["-v", "error", "-y", "-i", file, "-vf", `select='${selection}'`, "-fps_mode", "vfr", "-frames:v", String(indices.length), pattern.file], { timeout: 180000, maxBuffer: 1024 * 1024 });
  if (await hashAsset(file) !== job.references[0].sha256) throw new Error("Source changed during extraction.");
  const outputs = [];
  for (let i = 0; i < indices.length; i++) {
    const output = await outputFromFile(job.projectId, job.id, `frame-${String(i + 1).padStart(3, "0")}.png`);
    outputs.push({ ...output, frameIndex: indices[i], timestamp: probe.times[indices[i]] });
  }
  await updateAssetJob(job.projectId, job.id, { outputs, status: readAssetJob(job.projectId, job.id).cancelRequested ? "canceled" : "ready", error: undefined });
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
/** Cloud status poll interval; tests shorten it. */
const pollMs = () => Number(process.env.DREAMCUT_ASSET_POLL_MS) || 4000;
async function patchCloud(job: AssetJob, cloud: Partial<CloudJobState>, patch: Partial<AssetJob> = {}) {
  const fresh = readAssetJob(job.projectId, job.id);
  return updateAssetJob(job.projectId, job.id, { ...patch, cloud: { ...fresh.cloud!, ...cloud } });
}
const NOT_CHARGED = "Nothing was charged.";
/** A create the Cloud refused for a reason the creator can fix and then resume (same request, same price). */
function refusal(error: unknown): { message: string; final: boolean; insufficientCredits?: boolean } | null {
  if (error instanceof CloudSignedOutError) return { message: `Sign in to DreamCut, then try again. ${NOT_CHARGED}`, final: false };
  if (!(error instanceof CloudApiError)) return null;
  if (error.code === "insufficient_credits") return { message: `Not enough credits for this generation. ${NOT_CHARGED} Buy credits, then try again.`, final: false, insufficientCredits: true };
  if (error.status === 401) return { message: `Sign in to DreamCut, then try again. ${NOT_CHARGED}`, final: false };
  if (error.code === "price_changed") return { message: `${error.message} ${NOT_CHARGED}`, final: true };
  if (error.code === "too_many_uploads") return { message: `${error.message} ${NOT_CHARGED}`, final: false };
  return { message: `${error.message} ${NOT_CHARGED}`, final: true };
}
const progressFor = (generation: CloudGeneration) => ({ providerStatus: generation.status === "running" ? "IN_PROGRESS" : generation.status === "completed" ? "COMPLETED" : "IN_QUEUE", checkedAt: new Date().toISOString() });

/** Product path: upload references, create (idempotent by the local job id), poll, download, acknowledge. */
async function runCloud(job: AssetJob) {
  let current = readAssetJob(job.projectId, job.id);
  const cloud = current.cloud!;
  if (!cloud.generationId) {
    if (current.quote?.kind !== "credits") throw new Error("This request has no accepted price. Generate it again.");
    const uploads: Record<string, string> = { ...cloud.uploads };
    await updateAssetJob(job.projectId, job.id, { status: "submitting", error: undefined, progress: { providerStatus: "UPLOADING", checkedAt: new Date().toISOString() } });
    let created: CloudGeneration | null = null;
    try {
      for (const [i, r] of current.references.entries()) {
        // Requests recorded before several references per role keyed their uploads by role.
        if (uploads[i] ?? uploads[r.role]) continue;
        const file = await referenceUploadFile(current, i);
        uploads[i] = await uploadCloudReference(cloud.clientRequestId, file);
        releaseReferenceFile(current, file);
        await patchCloud(job, { uploads });
      }
      releaseReferenceScratch(job.projectId, job.id);
      // A cancel that arrived while references uploaded wins: nothing has been sent to charge yet.
      if (!cloud.createSentAt && readAssetJob(job.projectId, job.id).cancelRequested) {
        await updateAssetJob(job.projectId, job.id, { status: "canceled", error: undefined });
        return;
      }
      const body = { clientRequestId: cloud.clientRequestId, draft: cloudDraft(current.request, current.references.map((r, i) => uploads[i] ?? uploads[r.role])), acceptedCredits: current.quote.credits };
      const previouslySent = Boolean(cloud.createSentAt);
      await patchCloud(job, { createSentAt: cloud.createSentAt ?? new Date().toISOString() });
      for (let attempt = 0; !created; attempt++) {
        try { created = await createCloudGeneration(body); }
        catch (error) {
          // A repeat after an unanswered create may meet a changed price; the earlier call may still have succeeded.
          if (previouslySent && error instanceof CloudApiError && error.status === 409) {
            created = await findCloudGeneration(cloud.clientRequestId).catch(() => null);
            if (created) break;
          }
          const refused = refusal(error);
          if (refused) {
            await patchCloud(job, { final: refused.final, insufficientCredits: refused.insufficientCredits }, { status: "failed", error: refused.message });
            return;
          }
          if (attempt >= 2) {
            await updateAssetJob(job.projectId, job.id, { status: "uncertain", error: "DreamCut didn't confirm this request. Check again uses the same request, so it can't be charged twice." });
            return;
          }
          await sleep(Math.min(pollMs(), 1000) * (attempt + 1));
        }
      }
    } catch (error) {
      const refused = refusal(error);
      if (!refused && !readAssetJob(job.projectId, job.id).cloud?.createSentAt) throw new Error(`${error instanceof Error ? error.message : "Sending failed."} ${NOT_CHARGED} Resume to try again.`);
      if (!refused) throw error;
      await patchCloud(job, { final: refused.final, insufficientCredits: refused.insufficientCredits }, { status: "failed", error: refused.message });
      return;
    }
    current = await patchCloud(job, { generationId: created.id, insufficientCredits: undefined }, { status: "running", progress: progressFor(created) });
  }
  const id = current.cloud!.generationId!;
  const deadline = Date.now() + 50 * 60 * 1000;
  let generation: CloudGeneration;
  for (;;) {
    current = readAssetJob(job.projectId, job.id);
    if (current.cancelRequested && !current.cloud!.cancelRefused) {
      try {
        const canceled = await cancelCloudGeneration(id);
        await patchCloud(job, { final: true, refundedCredits: canceled.refundedCredits }, { status: "canceled", error: undefined });
        return;
      } catch (error) {
        if (!(error instanceof CloudApiError && error.status === 409)) throw error;
        await patchCloud(job, { cancelRefused: true }, { cancelRequested: false, error: "This generation already started and can't be canceled." });
      }
    }
    generation = await getCloudGeneration(id);
    if (generation.status === "completed") break;
    if (generation.status === "failed") {
      await patchCloud(job, { final: true }, { status: "failed", error: `${generation.error || "The generation failed."} DreamCut refunds the credits for a failed generation.` });
      return;
    }
    if (generation.status === "canceled") { await patchCloud(job, { final: true }, { status: "canceled" }); return; }
    await updateAssetJob(job.projectId, job.id, { progress: progressFor(generation) });
    if (Date.now() > deadline) throw new Error("Still waiting for DreamCut. Resume to keep checking this same request.");
    await sleep(pollMs());
  }
  if (!generation.outputs.length) {
    await patchCloud(job, { final: true }, { status: "failed", error: "The result is no longer stored on DreamCut. Results are kept for 14 days until downloaded." });
    return;
  }
  const outputs = [];
  try {
    for (const [index, file] of generation.outputs.entries()) {
      const name = `result-${index + 1}.${cloudOutputExtension(file.contentType)}`, target = stageFile(job.projectId, job.id, name);
      if (!fs.existsSync(target.file)) await downloadOutput(cloudMediaUrl(file.url), target.file, async (downloadedBytes, totalBytes) => {
        await updateAssetJob(job.projectId, job.id, { status: "saving", progress: { providerStatus: "COMPLETED", checkedAt: new Date().toISOString(), phase: "downloading", downloadedBytes, totalBytes: totalBytes ?? file.bytes ?? undefined, outputIndex: index + 1, outputCount: generation.outputs.length } });
      });
      await updateAssetJob(job.projectId, job.id, { progress: { ...readAssetJob(job.projectId, job.id).progress!, phase: "verifying", providerStatus: "COMPLETED", checkedAt: new Date().toISOString() } });
      outputs.push(await outputFromFile(job.projectId, job.id, name));
    }
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : "Download failed."} DreamCut keeps the result for 14 days until it is downloaded; resume to download it.`);
  }
  current = await patchCloud(job, { downloadedAt: new Date().toISOString() }, { outputs, status: "ready", error: undefined });
  await acknowledge(current);
}
/** Lets the Cloud delete its copy. Best effort: an unacknowledged result simply expires on the Cloud. */
async function acknowledge(job: AssetJob) {
  try {
    await acknowledgeCloudGeneration(job.cloud!.generationId!);
    await patchCloud(job, { acknowledgedAt: new Date().toISOString(), ackPending: undefined });
  } catch { await patchCloud(job, { ackPending: true }); }
}
async function runFal(job: AssetJob) {
  let current = readAssetJob(job.projectId, job.id);
  if (!current.provider) {
    if (current.status !== "queued") { await updateAssetJob(job.projectId, job.id, { status: "uncertain", error: "Submission may have reached fal.ai. Check the provider dashboard; this request will not be automatically resubmitted." }); return; }
    const refs: string[] = [];
    for (const [i, r] of current.references.entries()) {
      const file = await referenceUploadFile(current, i);
      if (fs.statSync(file).size > 24 * 1024 * 1024) throw new Error("Reference exceeds the 24 MB upload limit. Import a smaller reference clip.");
      refs.push(`data:${assetContentType(file)};base64,${fs.readFileSync(file).toString("base64")}`);
      releaseReferenceFile(current, file);
    }
    releaseReferenceScratch(job.projectId, job.id);
    await updateAssetJob(job.projectId, job.id, { status: "submitting" });
    let submitted;
    // Requests recorded before index placeholders used `asset:<source>`.
    const assetUrls = new Map<string, string>(current.references.flatMap((r, i) => [[`reference:${i}`, refs[i]], [`asset:${r.source}`, refs[i]]]));
    const replaceAssets = (value: unknown): unknown => typeof value === "string" ? assetUrls.get(value) ?? value : Array.isArray(value) ? value.map(replaceAssets) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === "prompt" ? v : replaceAssets(v)])) : value;
    try { submitted = await falRequest(`https://queue.fal.run/${job.model}`, "POST", job.resolvedInput ? replaceAssets(job.resolvedInput) : buildFalAssetInput(job.request, refs)); }
    catch (error) { await updateAssetJob(job.projectId, job.id, { status: "uncertain", error: error instanceof Error ? error.message : "Submission outcome unknown." }); return; }
    if (!submitted.request_id || !submitted.status_url || !submitted.response_url || !submitted.cancel_url) {
      await updateAssetJob(job.projectId, job.id, { status: "uncertain", error: "fal.ai returned an incomplete receipt. Check the provider dashboard before another generation." }); return;
    }
    current = await updateAssetJob(job.projectId, job.id, { status: "running", provider: { requestId: submitted.request_id, statusUrl: falProviderUrl(submitted.status_url), responseUrl: falProviderUrl(submitted.response_url), cancelUrl: falProviderUrl(submitted.cancel_url) } });
  }
  const deadline = Date.now() + 40 * 60 * 1000;
  while (!current.resultUrls) {
    current = readAssetJob(job.projectId, job.id);
    if (current.cancelRequested) {
      const cancel = await falRequest(current.provider!.cancelUrl, "PUT");
      if (cancel.success === true || ["CANCELLED", "CANCELED"].includes(cancel.status)) { await updateAssetJob(job.projectId, job.id, { status: "canceled" }); return; }
    }
    const status = await falRequest(current.provider!.statusUrl);
    await updateAssetJob(job.projectId, job.id, { progress: {
      providerStatus: String(status.status ?? "UNKNOWN").slice(0, 80), checkedAt: new Date().toISOString(),
      ...(typeof status.queue_position === "number" && Number.isFinite(status.queue_position) ? { queuePosition: status.queue_position } : {}),
    } });
    if (["CANCELLED", "CANCELED"].includes(status.status)) { await updateAssetJob(job.projectId, job.id, { status: "canceled" }); return; }
    if (["FAILED", "ERROR"].includes(status.status)) throw new Error("fal.ai generation failed. The request receipt is saved; inspect it before retrying.");
    if (status.status === "COMPLETED") {
      const result = await falRequest(current.provider!.responseUrl);
      const urls: string[] = result.video?.url ? [result.video.url] : result.audio?.url ? [result.audio.url] : (result.images ?? []).map((i: { url: string }) => i.url);
      if (!urls.length || urls.length > 4) throw new Error("Provider returned no supported results.");
      current = await updateAssetJob(job.projectId, job.id, { resultUrls: urls.map(falOutputUrl), status: "saving" }); break;
    }
    if (Date.now() > deadline) throw new Error("Still waiting for fal.ai. Resume status checks to retrieve this same request.");
    await new Promise(r => setTimeout(r, 4000));
  }
  const outputs = [];
  for (const [index, url] of current.resultUrls!.entries()) {
    const video = ["video", "animate", "motion", "recast"].includes(current.request.task);
    const extension = current.request.task === "music" ? (new URL(url).pathname.toLowerCase().endsWith(".wav") ? "wav" : "mp3") : video ? "mp4" : "png";
    const name = `result-${index + 1}.${extension}`, target = stageFile(job.projectId, job.id, name);
    if (!fs.existsSync(target.file)) await downloadOutput(falOutputUrl(url), target.file, async (downloadedBytes, totalBytes) => {
      await updateAssetJob(job.projectId, job.id, { status: "saving", progress: { providerStatus: "COMPLETED", checkedAt: new Date().toISOString(), phase: "downloading", downloadedBytes, totalBytes, outputIndex: index + 1, outputCount: current.resultUrls!.length } });
    });
    await updateAssetJob(job.projectId, job.id, { progress: { ...readAssetJob(job.projectId, job.id).progress!, phase: "verifying", providerStatus: "COMPLETED", checkedAt: new Date().toISOString() } });
    outputs.push(await outputFromFile(job.projectId, job.id, name));
  }
  await updateAssetJob(job.projectId, job.id, { outputs, status: "ready", error: undefined });
}
export async function runAssetJob(projectId: string, id: string) {
  const lock = jobPath(projectId, id) + ".worker";
  const claimed = await withAssetJobLock(projectId, id, () => {
  // A persistent owner prevents reloads/repeated start requests from duplicating jobs.
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, "utf8"));
    if (!Number.isInteger(pid) || pid <= 0) throw new Error("Invalid worker owner; inspect the request before restarting.");
    try { process.kill(pid, 0); return false; } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ESRCH") return false; }
    // Rename the stale lock rather than deleting an unchecked path.
    try { fs.renameSync(lock, lock + `.stale-${process.pid}`); } catch { return false; }
  }
  let fd: number;
  try { fd = fs.openSync(lock, "wx", 0o600); } catch { return false; }
  fs.writeFileSync(fd, String(process.pid)); fs.closeSync(fd);
  return true;
  });
  if (!claimed) return;
  try {
    const job = readAssetJob(projectId, id);
    if (job.status === "ready" && job.cloud?.ackPending) { await acknowledge(job); return; }
    if (["ready", "waiting_codex", "canceled", "uncertain", "failed"].includes(job.status)) return;
    if (job.cancelRequested && !job.provider && !job.cloud?.createSentAt && job.status === "queued") { await updateAssetJob(projectId, id, { status: "canceled" }); return; }
    for (const r of job.references) if (await hashAsset(resolveGenerationSource(projectId, r.source)) !== r.sha256) throw new Error("A reference changed since submission. Create a new request with the updated reference.");
    if (job.request.task === "extract") { await updateAssetJob(projectId, id, { status: "running" }); await extract(job); }
    else if (job.transport === "cloud") await runCloud(job);
    else await runFal(job);
  } catch (error) {
    await updateAssetJob(projectId, id, { status: "failed", error: error instanceof Error ? error.message : "Asset generation failed." });
  } finally {
    const status = readAssetJob(projectId, id).status;
    if (!["queued", "submitting", "running", "saving"].includes(status)) releaseReferenceScratch(projectId, id);
    fs.unlinkSync(lock);
  }
}
