/** Editor sign-in to DreamCut Cloud through the site's connect flow (`/connect` + `/api/v1/connect/*`).
 * The session lives only in `profileDir()/private-credentials/` (0600); browsers never see a token. Each Cloud
 * (`DREAMCUT_CLOUD_URL`) has its own session, so an editor pointed at a development Cloud can never use, refresh or
 * sign out the dreamcut.io one. */
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { DEFAULT_CLOUD_URL, cloudBaseUrl } from "@/lib/cloud/base-url";
import { readPrivateCredential, removePrivateCredential, writePrivateCredential } from "./provider-keys";

/** This Cloud's session file: the dreamcut.io one keeps the name it has always had; any other Cloud is named by
 * its host and port (`dreamcut-cloud-127-0-0-1-3401.json`). */
export function cloudSessionFile(env: Record<string, string | undefined> = process.env) {
  return `dreamcut-cloud${cloudSuffix(env)}.json`;
}
const cloudSuffix = (env: Record<string, string | undefined>) => {
  const base = cloudBaseUrl(env);
  return base === DEFAULT_CLOUD_URL ? "" : `-${new URL(base).host.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
};
const pendingFile = () => `dreamcut-connect${cloudSuffix(process.env)}.json`;
const PENDING_MS = 10 * 60 * 1000;
/** Refresh this long before the access token expires. */
const REFRESH_MARGIN_SECONDS = 120;
const TIMEOUT_MS = 15_000;

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

const sessionSchema = z.object({
  access_token: z.string().min(1).max(8192),
  refresh_token: z.string().min(1).max(4096),
  expires_at: z.number().int().positive(),
  email: z.string().max(320),
  signed_in_at: z.string(),
}).strict();
export type CloudSession = z.infer<typeof sessionSchema>;
const pendingSchema = z.object({ state: z.string(), verifier: z.string(), created_at: z.number() }).strict();
const tokenResponse = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1), expires_at: z.number(), email: z.string().nullish() });

export class CloudSignedOutError extends Error {
  constructor(message = "Sign in to DreamCut again.") { super(message); }
}

const base64url = (buffer: Buffer) => buffer.toString("base64url");

function readSession(): CloudSession | null {
  const raw = readPrivateCredential(cloudSessionFile(), 32 * 1024);
  if (raw === undefined) return null;
  const parsed = sessionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
function saveSession(body: z.infer<typeof tokenResponse>, previous?: CloudSession | null): CloudSession {
  const session: CloudSession = {
    access_token: body.access_token, refresh_token: body.refresh_token, expires_at: Math.floor(body.expires_at),
    email: body.email ?? previous?.email ?? "", signed_in_at: previous?.signed_in_at ?? new Date().toISOString(),
  };
  writePrivateCredential(cloudSessionFile(), session);
  return session;
}

export type CloudAccountStatus = { signed_in: boolean; email: string | null; pending: boolean };
export function cloudAccountStatus(): CloudAccountStatus {
  const session = readSession();
  const pending = pendingSchema.safeParse(readPrivateCredential(pendingFile()) ?? null);
  return { signed_in: Boolean(session), email: session?.email || null, pending: pending.success && Date.now() - pending.data.created_at < PENDING_MS };
}
export function isCloudSignedIn() { return Boolean(readSession()); }

/** Starts a connect: remembers the PKCE verifier and returns the dreamcut.io page to open. */
export function beginCloudSignIn(callbackUrl: string, env: Record<string, string | undefined> = process.env) {
  const callback = new URL(callbackUrl);
  if (callback.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(callback.hostname) || !callback.port) {
    throw new Error("Open DreamCut on this computer to sign in.");
  }
  const verifier = base64url(randomBytes(32));
  const state = base64url(randomBytes(24));
  writePrivateCredential(pendingFile(), { state, verifier, created_at: Date.now() });
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const url = new URL(`${cloudBaseUrl(env)}/connect`);
  url.search = new URLSearchParams({ redirect_uri: callback.toString(), state, code_challenge: challenge }).toString();
  return { url: url.toString() };
}

/** Finishes a connect from the loopback callback: checks state, exchanges the one-time code. */
export async function completeCloudSignIn(code: string, state: string, fetcher: Fetcher = fetch) {
  const pending = pendingSchema.safeParse(readPrivateCredential(pendingFile()) ?? null);
  if (!pending.success || pending.data.state !== state || Date.now() - pending.data.created_at > PENDING_MS) {
    throw new Error("This sign-in link has expired. Start again from Settings.");
  }
  removePrivateCredential(pendingFile());
  const response = await fetcher(`${cloudBaseUrl()}/api/v1/connect/token`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, code_verifier: pending.data.verifier }), signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await response.json().catch(() => null);
  const parsed = tokenResponse.safeParse(body);
  if (!response.ok || !parsed.success) throw new Error(String(body?.message ?? "Sign-in did not complete. Try again."));
  return saveSession(parsed.data);
}

export function cancelCloudSignIn() { removePrivateCredential(pendingFile()); }
export function signOutOfCloud() { removePrivateCredential(pendingFile()); removePrivateCredential(cloudSessionFile()); }

const refreshKey = Symbol.for("dreamcut.cloudRefresh");
/** One refresh at a time per Cloud. */
type Global = typeof globalThis & { [refreshKey]?: Map<string, Promise<CloudSession>> };

async function refreshSession(session: CloudSession, fetcher: Fetcher): Promise<CloudSession> {
  const shared = ((globalThis as Global)[refreshKey] ??= new Map()), cloud = cloudBaseUrl();
  const inFlight = shared.get(cloud);
  if (inFlight) return inFlight;
  const pending = (async () => {
    const response = await fetcher(`${cloudBaseUrl()}/api/v1/connect/refresh`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }), signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 401) {
      // The refresh token was revoked or rotated away: the session is over on this computer.
      if (readSession()?.refresh_token === session.refresh_token) removePrivateCredential(cloudSessionFile());
      throw new CloudSignedOutError();
    }
    const parsed = tokenResponse.safeParse(await response.json().catch(() => null));
    if (!response.ok || !parsed.success) throw new Error(`DreamCut Cloud refresh failed (HTTP ${response.status}).`);
    return saveSession(parsed.data, session);
  })();
  shared.set(cloud, pending);
  try { return await pending; } finally { if (shared.get(cloud) === pending) shared.delete(cloud); }
}

/** A current access token, refreshed shortly before expiry. Throws CloudSignedOutError when signed out. */
export async function cloudAccessToken(fetcher: Fetcher = fetch, now = () => Date.now()): Promise<string> {
  const session = readSession();
  if (!session) throw new CloudSignedOutError("Not signed in to DreamCut.");
  if (session.expires_at - REFRESH_MARGIN_SECONDS > now() / 1000) return session.access_token;
  return (await refreshSession(session, fetcher)).access_token;
}

/** Authenticated call to the Cloud API (`/api/v1/...`). Retries once after a refresh on 401; a Cloud that still
 * refuses a freshly refreshed session does not accept it, so this computer is signed out of that Cloud. */
export async function cloudFetch(pathname: string, init: RequestInit = {}, fetcher: Fetcher = fetch): Promise<Response> {
  const send = (token: string) => fetcher(`${cloudBaseUrl()}${pathname}`, {
    ...init, signal: init.signal ?? AbortSignal.timeout(30_000),
    headers: { accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` },
  });
  const response = await send(await cloudAccessToken(fetcher));
  if (response.status !== 401) return response;
  const session = readSession();
  if (!session) throw new CloudSignedOutError();
  const refreshed = await refreshSession(session, fetcher);
  const retried = await send(refreshed.access_token);
  if (retried.status !== 401) return retried;
  if (readSession()?.refresh_token === refreshed.refresh_token) removePrivateCredential(cloudSessionFile());
  throw new CloudSignedOutError();
}
