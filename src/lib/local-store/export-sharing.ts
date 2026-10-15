import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { readEnv } from "@/lib/env-name";
import { readJsonFile, writeJsonFileAtomic } from "@/lib/local-store/atomic-json";
import { memoryDir, profileDir, readEditingProfile, retroPath, type RetroRecord } from "./editing-memory";
import { buildRetroEvidence } from "./editing-retro";
import { CloudSignedOutError, cloudAccountStatus, cloudFetch } from "./cloud-account";

// Shares a completed export's privacy-limited edit packet with DreamCut's cloud
// learning service. The packet is the same projection the local retro worker
// reads (no media, source URLs, local paths or caption transcripts), so a cloud
// retro can later replace the local one without a second evidence format.
// Uploads are an outbox: each export records its status under
// memory/cloud-uploads/, and later exports retry earlier failures.
// Signed in to DreamCut, packets go to the account's authenticated
// /api/v1/evidence and the install ID is claimed by the account; signed out,
// they go to the pseudonymous ingest-export Edge Function as before.

export const EXPORT_PACKET_SCHEMA = "dreamcut.export-packet.v1";
const DEFAULT_INGEST_URL = "https://wfhrmytgsafvgppjdbgq.supabase.co/functions/v1/ingest-export";
const MAX_ATTEMPTS = 5;

type UploadStatus = { job_id: string; status: "uploaded" | "failed"; attempts: number; updated_at: string; error?: string };
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** `off` (or any non-https value) disables uploads, e.g. for tests and offline development. */
export function exportIngestUrl(env: Record<string, string | undefined> = process.env): string | null {
  const configured = readEnv("CLOUD_INGEST_URL", env);
  if (configured !== undefined) return /^https:\/\//.test(configured) ? configured : null;
  if (env.NODE_TEST_CONTEXT) return null;
  return DEFAULT_INGEST_URL;
}

export function exportSharingEnabled() {
  const profile = readEditingProfile();
  // The packet is the learning checkpoint, so sharing needs learning on.
  return profile.learning && profile.cloud_sharing !== false;
}

/** A random per-install identifier. It is not derived from the machine or the user. */
export function installId(): string {
  const file = path.join(profileDir(), "install.json");
  const existing = readJsonFile<{ install_id?: string } | null>(file, null);
  if (existing?.install_id) return existing.install_id;
  const created = { install_id: randomUUID(), created_at: new Date().toISOString() };
  writeJsonFileAtomic(file, created);
  return created.install_id;
}

function statusPath(projectId: string, jobId: string) {
  return path.join(memoryDir(projectId), "cloud-uploads", `${jobId}.json`);
}

export function buildExportPacket(projectId: string, record: RetroRecord) {
  return {
    schema: EXPORT_PACKET_SCHEMA,
    install_id: installId(),
    project_id: projectId,
    job_id: record.id,
    checkpoint_revision: record.revision,
    checkpoint_created_at: record.created_at,
    app_version: readEnv("APP_VERSION") ?? process.env.npm_package_version ?? null,
    evidence: buildRetroEvidence(record.checkpoint),
  };
}

type Send = (body: string) => Promise<Response>;

async function uploadOne(projectId: string, jobId: string, send: Send): Promise<UploadStatus | null> {
  const record = readJsonFile<RetroRecord | null>(retroPath(projectId, jobId), null);
  if (!record) return null;
  const previous = readJsonFile<UploadStatus | null>(statusPath(projectId, jobId), null);
  if (previous?.status === "uploaded" || (previous && previous.attempts >= MAX_ATTEMPTS)) return previous;
  const attempts = (previous?.attempts ?? 0) + 1;
  let next: UploadStatus;
  try {
    const response = await send(JSON.stringify(buildExportPacket(projectId, record)));
    next = response.ok
      ? { job_id: jobId, status: "uploaded", attempts, updated_at: new Date().toISOString() }
      : { job_id: jobId, status: "failed", attempts, updated_at: new Date().toISOString(), error: `HTTP ${response.status}` };
  } catch (error) {
    next = { job_id: jobId, status: "failed", attempts, updated_at: new Date().toISOString(), error: String(error) };
  }
  writeJsonFileAtomic(statusPath(projectId, jobId), next);
  return next;
}

type ClaimRecord = { account: string; install_id: string; status: "claimed" | "claimed_by_other"; updated_at: string };
const claimPath = () => path.join(profileDir(), "cloud-sync", "install-claim.json");

/** Links this install's evidence to the signed-in account. 409 means another account owns it. */
export async function claimInstall(fetcher: Fetcher = fetch): Promise<ClaimRecord | null> {
  const account = cloudAccountStatus();
  if (!account.signed_in) return null;
  const install = installId();
  const existing = readJsonFile<ClaimRecord | null>(claimPath(), null);
  if (existing?.account === account.email && existing.install_id === install) return existing;
  const response = await cloudFetch("/api/v1/installs/claim", { method: "POST", body: JSON.stringify({ install_id: install }) }, fetcher);
  if (!response.ok && response.status !== 409) throw new Error(`Install claim failed (HTTP ${response.status}).`);
  const record: ClaimRecord = { account: account.email ?? "", install_id: install, status: response.ok ? "claimed" : "claimed_by_other", updated_at: new Date().toISOString() };
  writeJsonFileAtomic(claimPath(), record);
  return record;
}

/** Signed in: the account's authenticated endpoint. Signed out: the pseudonymous ingest function. */
async function uploadSender(ingestUrl: string, fetcher: Fetcher): Promise<Send> {
  if (cloudAccountStatus().signed_in) {
    await claimInstall(fetcher).catch(() => null); // a failed claim is retried on the next export
    return async body => {
      try {
        return await cloudFetch("/api/v1/evidence", { method: "POST", body, signal: AbortSignal.timeout(30_000) }, fetcher);
      } catch (error) {
        // Signed out between exports: fall back to the pseudonymous path for this packet.
        if (error instanceof CloudSignedOutError) return anonymous(ingestUrl, fetcher)(body);
        throw error;
      }
    };
  }
  return anonymous(ingestUrl, fetcher);
}
const anonymous = (url: string, fetcher: Fetcher): Send => body => fetcher(url, {
  method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(30_000),
});

/** Upload this export's packet, then retry this project's earlier failed uploads. Never throws. */
export async function shareExportPacket(projectId: string, jobId: string, fetcher: Fetcher = fetch) {
  const url = exportIngestUrl();
  if (!url || !exportSharingEnabled()) return [];
  const directory = path.join(memoryDir(projectId), "cloud-uploads");
  const retries = fs.existsSync(directory)
    ? fs.readdirSync(directory).filter(name => name.endsWith(".json")).map(name => name.slice(0, -5)).filter(id => id !== jobId)
    : [];
  const results: UploadStatus[] = [];
  const send = await uploadSender(url, fetcher);
  for (const id of [jobId, ...retries]) {
    const result = await uploadOne(projectId, id, send).catch(() => null);
    if (result) results.push(result);
  }
  return results;
}
