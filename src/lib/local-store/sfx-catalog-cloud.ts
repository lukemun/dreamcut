/**
 * Shared catalog sounds from DreamCut Cloud.
 *
 * The free sounds' list ships with the editor; the members-only list comes from DreamCut Cloud only for a
 * signed-in member (`GET /api/v1/sounds/catalog`, cached as members-catalog.json beside the sounds and
 * removed with them). Audio never ships. A sound that is not in this
 * checkout's `catalogs/sfx/audio/` is downloaded on first use from DreamCut Cloud
 * (`GET /api/v1/sounds/<file>` returns a short-lived link), checked against the entry's SHA-256 and
 * kept in the profile's sound cache. Free sounds download for anyone; members-only sounds need a
 * signed-in DreamCut member. Cached members-only sounds are deleted when the creator signs out or
 * DreamCut Cloud says they are no longer a member. This is a deterrent, not DRM.
 *
 * Storage: the cache is rebuildable (every file can be downloaded again), bounded by the catalog,
 * written to a temporary name and renamed into place only after its hash matches.
 */
import fs from "node:fs";
import path from "node:path";

import { cloudBaseUrl } from "@/lib/cloud/base-url";
import { cloudMembership } from "@/lib/cloud/membership";
import { toolError } from "@/lib/agent/tool-error";
import { sfxCatalogSchema } from "@/lib/sfx-catalog/schema";

import { saveCatalogDownload } from "./catalog-cloud-download";
import { writeJsonFileAtomic } from "./atomic-json";
import { CloudSignedOutError, cloudAccountStatus, cloudFetch, type Fetcher } from "./cloud-account";
import { readSharedSfxCatalog, sfxCloudCachePath, sfxMembersCatalogPath } from "./sfx-catalog";

/** Free space kept beyond one sound's bytes before writing to the cache. */
const HEADROOM_BYTES = 256 * 1024 * 1024;
const MAX_SOUND_BYTES = 50 * 1024 * 1024;

function entryFor(relativeFile: string) {
  const file = relativeFile.split(path.sep).join("/");
  return readSharedSfxCatalog().sound_effects.find((entry) => entry.file === file) ?? null;
}

/** Whether the creator may keep members-only sounds now: false only on a definite answer. */
async function mayUseMembersSounds(): Promise<boolean> {
  if (!cloudAccountStatus().signed_in) return false;
  const membership = await cloudMembership();
  // Unreachable billing (null) keeps what is already downloaded working offline.
  return membership.member !== false;
}

/** Delete every cached members-only sound. Returns how many were removed. */
export function removeMembersOnlySounds(): number {
  let removed = 0;
  for (const entry of readSharedSfxCatalog().sound_effects) {
    if (entry.access !== "members") continue;
    try { fs.rmSync(sfxCloudCachePath(entry.file)); removed += 1; } catch { /* not cached */ }
  }
  return removed;
}

/** A cached members' list younger than this is not fetched again. */
const MEMBERS_LIST_TTL_MS = 60 * 60 * 1000;

/**
 * Keeps the members-only sound list in step with membership. A member gets the list from DreamCut Cloud; once
 * the creator signs out or is definitely not a member, the cached members' sounds and the list are removed.
 * An unknown membership (Cloud unreachable) leaves both, so a member keeps working offline.
 */
export async function syncMembersSfxCatalog(membership: { signed_in: boolean; member: boolean | null }, fetcher: Fetcher = fetch, now = Date.now()): Promise<void> {
  const listPath = sfxMembersCatalogPath();
  if (!membership.signed_in || membership.member === false) {
    removeMembersOnlySounds();
    fs.rmSync(listPath, { force: true });
    return;
  }
  if (membership.member !== true) return;
  try { if (now - fs.statSync(listPath).mtimeMs < MEMBERS_LIST_TTL_MS) return; } catch { /* not cached yet */ }
  const response = await cloudFetch("/api/v1/sounds/catalog", { signal: AbortSignal.timeout(15_000) }, fetcher);
  if (!response.ok) throw new Error(`DreamCut could not provide the members' sound list (${response.status}).`);
  const catalog = sfxCatalogSchema.parse(await response.json());
  writeJsonFileAtomic(listPath, { schema_version: 1, sound_effects: catalog.sound_effects.map((entry) => ({ ...entry, access: "members" })) });
}

function membershipError(signedIn: boolean): never {
  throw toolError(
    signedIn ? "MEMBERSHIP_REQUIRED" : "SIGN_IN_REQUIRED",
    signedIn ? "This sound is for DreamCut members." : "Sign in to DreamCut to use members' sounds.",
    { action: "ask_creator", reason: signedIn ? "Choose a free sound, or the creator can become a DreamCut member." : "The creator can sign in to DreamCut, or choose a free sound." },
    signedIn ? 402 : 401,
  );
}

const downloads = new Map<string, Promise<string>>();

async function download(relativeFile: string, entry: NonNullable<ReturnType<typeof entryFor>>): Promise<string> {
  const target = sfxCloudCachePath(relativeFile);
  const pathname = `/api/v1/sounds/${entry.file.split("/").map(encodeURIComponent).join("/")}`;
  const signedIn = cloudAccountStatus().signed_in;
  let response: Response;
  try {
    response = signedIn
      ? await cloudFetch(pathname)
      : await fetch(`${cloudBaseUrl()}${pathname}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    if (error instanceof CloudSignedOutError) membershipError(false);
    throw Object.assign(new Error("Could not reach DreamCut to download this sound. Check the connection and try again."), { status: 503 });
  }
  if (response.status === 401) membershipError(false);
  if (response.status === 403) membershipError(true);
  if (!response.ok) throw Object.assign(new Error(`DreamCut could not provide this sound (${response.status}).`), { status: response.status === 404 ? 404 : 502 });
  return saveCatalogDownload(response, { target, sha256: entry.sha256, maxBytes: MAX_SOUND_BYTES, reserveBytes: HEADROOM_BYTES, timeoutMs: 60_000, noun: "sound" });
}

/**
 * The local path of a shared catalog sound, downloading it from DreamCut Cloud when needed.
 * Checkout files (`catalogs/sfx/audio/`) are used as they are; cached members-only sounds are
 * re-checked against the creator's membership and removed when it has ended.
 */
export async function ensureSfxCatalogFile(relativeFile: string, checkoutPath: string): Promise<string> {
  if (fs.existsSync(checkoutPath)) return checkoutPath;
  const entry = entryFor(relativeFile);
  if (!entry) throw Object.assign(new Error("No such catalog sound."), { status: 404 });
  const cached = sfxCloudCachePath(relativeFile);
  if (entry.access === "members" && !(await mayUseMembersSounds())) {
    removeMembersOnlySounds();
    membershipError(cloudAccountStatus().signed_in);
  }
  if (fs.existsSync(cached)) return cached;
  const key = cached;
  const pending = downloads.get(key) ?? download(relativeFile, entry);
  downloads.set(key, pending);
  try { return await pending; } finally { downloads.delete(key); }
}
