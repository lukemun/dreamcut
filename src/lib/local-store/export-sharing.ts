import fs from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { readEnv } from "@/lib/env-name";
import { readJsonFile, writeJsonFileAtomic } from "@/lib/local-store/atomic-json";
import { exportCheckpointPath, memoryDir, profileDir, readEditingProfile, type ExportCheckpoint } from "./editing-memory";
import { buildExportEvidence } from "./export-evidence";
import { cloudAccountStatus, cloudFetch } from "./cloud-account";

// Shares a completed export's privacy-limited edit packet with DreamCut Cloud
// (no media, source URLs, local paths or caption transcripts).
// Uploads are an outbox: each export records its status under
// memory/cloud-uploads/, and later exports retry earlier failures.
// Packets go only to the signed-in account's authenticated /api/v1/evidence,
// and the install ID is claimed by the account. Signed out, nothing is sent
// (the pseudonymous ingest-export path was removed 2026-10-27).

export const EXPORT_PACKET_SCHEMA = "dreamcut.export-packet.v1";
const MAX_ATTEMPTS = 5;

type UploadStatus = { job_id: string; status: "uploaded" | "failed"; attempts: number; updated_at: string; error?: string };
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** `DREAMCUT_CLOUD_INGEST_URL=off` (or any non-https value) turns uploads off, e.g. for tests and offline development.
 * The name predates account-only uploads; an https value only keeps them on. */
export function evidenceUploadsAllowed(env: Record<string, string | undefined> = process.env): boolean {
  const configured = readEnv("CLOUD_INGEST_URL", env);
  if (configured !== undefined) return /^https:\/\//.test(configured);
  return !env.NODE_TEST_CONTEXT;
}

export function exportSharingEnabled() {
  return readEditingProfile().cloud_sharing !== false;
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

export function buildExportPacket(projectId: string, record: ExportCheckpoint) {
  return {
    schema: EXPORT_PACKET_SCHEMA,
    install_id: installId(),
    project_id: projectId,
    job_id: record.id,
    checkpoint_revision: record.revision,
    checkpoint_created_at: record.created_at,
    app_version: readEnv("APP_VERSION") ?? process.env.npm_package_version ?? null,
    evidence: buildExportEvidence(record.checkpoint),
  };
}

type Send = (body: string) => Promise<Response>;

async function uploadOne(projectId: string, jobId: string, send: Send): Promise<UploadStatus | null> {
  const record = readJsonFile<ExportCheckpoint | null>(exportCheckpointPath(projectId, jobId), null);
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

/** The account's authenticated endpoint, or null when signed out: nothing is shared without an account. */
async function uploadSender(fetcher: Fetcher): Promise<Send | null> {
  if (!cloudAccountStatus().signed_in) return null;
  await claimInstall(fetcher).catch(() => null); // a failed claim is retried on the next export
  // Signed out between exports: the send fails and the outbox retries it once signed in again.
  return body => cloudFetch("/api/v1/evidence", { method: "POST", body, signal: AbortSignal.timeout(30_000) }, fetcher);
}

/** Background evidence uses the same account endpoint; signed out it sends nothing (null), and it never
 * sends if the account changes during a send. Recheck the sharing choice after auth work. */
export async function sendEditingEvidence(body: string, fetcher: Fetcher = fetch): Promise<Response | null> {
  if (!evidenceUploadsAllowed() || !exportSharingEnabled()) return null;
  const account = cloudAccountStatus();
  if (!account.signed_in) return null;
  const claim = await claimInstall(fetcher);
  if (claim?.status !== "claimed") throw new Error("Editing evidence install claim unavailable.");
  const current = cloudAccountStatus();
  if (!exportSharingEnabled() || !evidenceUploadsAllowed() || !current.signed_in || current.email !== account.email) return null;
  // Background packets are sent gzip-compressed (roughly a tenth of the JSON). A cloud that does not
  // accept compression yet answers 415, and the same packet is resent uncompressed.
  const post = (payload: BodyInit, headers: Record<string, string>) =>
    cloudFetch("/api/v1/evidence", { method: "POST", body: payload, headers, signal: AbortSignal.timeout(30_000) }, fetcher);
  const response = await post(new Uint8Array(gzipSync(body)), { "Content-Encoding": "gzip" });
  return response.status === 415 ? post(body, {}) : response;
}

/** Signed in, upload this export's packet, then retry this project's earlier failed uploads. Never throws. */
export async function shareExportPacket(projectId: string, jobId: string, fetcher: Fetcher = fetch) {
  if (!evidenceUploadsAllowed() || !exportSharingEnabled()) return [];
  const directory = path.join(memoryDir(projectId), "cloud-uploads");
  const retries = fs.existsSync(directory)
    ? fs.readdirSync(directory).filter(name => name.endsWith(".json")).map(name => name.slice(0, -5)).filter(id => id !== jobId)
    : [];
  const results: UploadStatus[] = [];
  const send = await uploadSender(fetcher);
  if (!send) return [];
  for (const id of [jobId, ...retries]) {
    const result = await uploadOne(projectId, id, send).catch(() => null);
    if (result) results.push(result);
  }
  return results;
}
