/**
 * Sentry settings from DreamCut Cloud for a signed-in editor. This repository carries no DSN: a checkout that
 * sets its own in `.env.local` keeps using it, and any other editor turns Sentry on only while signed in, with
 * the settings `GET /api/v1/telemetry` returns. They are cached in the profile for the signed-in account and
 * removed on sign-out, so a signed-out editor sends nothing; turning off "Share edits to improve DreamCut" stops
 * them too.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import { readJsonFile, writeJsonFileAtomic } from "@/lib/local-store/atomic-json";
import { cloudAccountStatus, cloudFetch, type Fetcher } from "@/lib/local-store/cloud-account";
import { exportSharingEnabled, installId } from "@/lib/local-store/export-sharing";
import { profileDir } from "@/lib/local-store/profile-dir";

const sentrySchema = z.object({
  dsn: z.string().regex(/^https:\/\/[0-9a-f]+@[\w.-]+\/\d+$/),
  environment: z.string().min(1).max(64),
  error_sample_rate: z.number().min(0).max(1).optional(),
  traces_sample_rate: z.number().min(0).max(1).optional(),
});
const responseSchema = z.object({ sentry: sentrySchema.nullable() });
const cacheSchema = z.object({ account: z.string(), fetched_at: z.number(), sentry: sentrySchema.nullable() });
export type CloudSentry = z.infer<typeof sentrySchema>;
/** What the page needs to start Sentry: the settings and this install's random id, so a report can be
 * matched to the account that claimed the install. */
export type CloudTelemetry = { sentry: (CloudSentry & { install_id: string }) | null };

/** Settings younger than this are not fetched again. */
const TTL_MS = 60 * 60 * 1000;
/** A failed fetch is retried after this long when no settings are held. */
const RETRY_MS = 5 * 60 * 1000;

export const cloudTelemetryPath = () => path.join(profileDir(), "cloud-telemetry.json");

/** Whether this checkout configures Sentry itself (`.env.local`); cloud settings never replace it. */
export function localSentryConfigured(env: Record<string, string | undefined> = process.env) {
  return (env.SENTRY_ENABLED ?? env.NEXT_PUBLIC_SENTRY_ENABLED) === "1" && Boolean(env.SENTRY_DSN ?? env.NEXT_PUBLIC_SENTRY_DSN);
}

function readCache() {
  const parsed = cacheSchema.safeParse(readJsonFile<unknown>(cloudTelemetryPath(), null));
  return parsed.success ? parsed.data : null;
}

export function clearCloudTelemetry() { fs.rmSync(cloudTelemetryPath(), { force: true }); }

/** The cached settings, only for the account signed in now. */
export function readCloudTelemetry(): CloudTelemetry {
  const account = cloudAccountStatus();
  const cache = readCache();
  // "Share edits to improve DreamCut" off stops error reports along with uploads.
  if (!account.signed_in || !exportSharingEnabled() || !cache?.sentry || cache.account !== (account.email ?? "")) return { sentry: null };
  return { sentry: { ...cache.sentry, install_id: installId() } };
}

/** Brings the cache in step with the account: removed when signed out, fetched when missing or stale.
 * An unreachable Cloud keeps what is cached. */
export async function syncCloudTelemetry(fetcher: Fetcher = fetch, now = Date.now()): Promise<CloudTelemetry> {
  const account = cloudAccountStatus();
  if (!account.signed_in) { clearCloudTelemetry(); return { sentry: null }; }
  const email = account.email ?? "";
  const cache = readCache();
  if (cache && cache.account === email && now - cache.fetched_at < TTL_MS) return readCloudTelemetry();
  // A failed fetch keeps this account's last settings and asks again after a full TTL; holding no settings
  // (a sign-in during a Cloud outage), it asks every few minutes. Either way an unreachable Cloud is not
  // asked on every page load.
  let sentry = cache?.account === email ? cache.sentry : null;
  let fetchedAt = now;
  try {
    const response = await cloudFetch("/api/v1/telemetry", { signal: AbortSignal.timeout(10_000) }, fetcher);
    if (response.ok) sentry = responseSchema.parse(await response.json()).sentry;
    else throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.error("[cloud-telemetry] settings not refreshed", error instanceof Error ? error.message : error);
    if (!sentry) fetchedAt = now - TTL_MS + RETRY_MS;
  }
  if (cloudAccountStatus().signed_in) writeJsonFileAtomic(cloudTelemetryPath(), { account: email, fetched_at: fetchedAt, sentry });
  return readCloudTelemetry();
}
