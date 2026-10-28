"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { refreshCloudSentry } from "@/lib/observability/cloud-sentry-client";
import { MembershipOffer, useMembership } from "./MembershipPrompt";

export type CloudAccountView = {
  signed_in: boolean; email: string | null; pending: boolean;
  style_sync: { revision: number | null; synced_at: string | null; error: string | null; kept_versions: number } | null;
};

export async function cloudAccountRequest(body?: unknown): Promise<CloudAccountView & { url?: string }> {
  const response = await fetch("/api/user/cloud-account", body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "DreamCut account is unavailable.");
  return data;
}

function syncedLabel(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "Style synced just now";
  if (minutes < 60) return `Style synced ${minutes} min ago`;
  return `Style synced ${new Date(iso).toLocaleString()}`;
}

/** Account state and actions shared by the User header and the Settings card. Tokens stay on the
 * local server; callers only see the account email and sync state. */
export function useCloudAccount() {
  const [account, setAccount] = useState<CloudAccountView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signInUrl, setSignInUrl] = useState<string | null>(null);
  const poll = useRef<number | null>(null);

  const load = useCallback(async () => {
    try { const next = await cloudAccountRequest(); setAccount(next); setError(""); return next; }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); return null; }
  }, []);
  const stopPolling = () => { if (poll.current !== null) { window.clearInterval(poll.current); poll.current = null; } };
  useEffect(() => { void load(); return stopPolling; }, [load]);
  // Error reporting follows the account: on while signed in, off once signed out.
  const signedIn = account?.signed_in;
  useEffect(() => { if (signedIn !== undefined) void refreshCloudSentry(); }, [signedIn]);
  // While the browser sign-in is open, watch for the callback to complete.
  useEffect(() => {
    if (!account?.pending || account.signed_in) { stopPolling(); return; }
    if (poll.current === null) poll.current = window.setInterval(() => void load(), 2000);
  }, [account?.pending, account?.signed_in, load]);

  async function act(action: "sign_in" | "cancel" | "sign_out" | "sync") {
    setBusy(true); setError("");
    try {
      const next = await cloudAccountRequest({ action });
      setAccount(next);
      if (action === "sign_in" && next.url) {
        setSignInUrl(next.url);
        const opened = window.open(next.url, "_blank");
        if (opened) opened.opener = null;
      }
      if (action !== "sign_in") setSignInUrl(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  return { account, busy, error, signInUrl, act };
}

/** Memory → Settings: sign this editor in to the creator's DreamCut account. */
export function CloudAccountSettings() {
  const id = useId();
  const { account, busy, error, signInUrl, act } = useCloudAccount();
  const membership = useMembership(account);
  const sync = account?.style_sync;
  const status = !account ? (error ? "" : "Checking…")
    : account.signed_in ? (account.email || "Signed in")
    : account.pending ? "Waiting for your browser" : "Not signed in";
  const detail = account?.signed_in && sync
    ? (sync.error ? `Style not synced: ${sync.error}` : sync.synced_at ? syncedLabel(sync.synced_at) : "Style syncing…")
    : null;
  // Same section shape as "Settings for this computer": heading, then label left and actions right.
  return <section className="space-y-3 rounded-xl bg-[var(--chrome-panel)] p-6" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className="text-lg font-semibold">DreamCut account</h2>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
      <div className="min-w-0" role="status">
        <p className="truncate text-[var(--ink)]">{status}</p>
        {detail && <p className="text-[var(--ink-muted)]">{detail}</p>}
        {account && !account.signed_in && !account.pending && <p className="text-[var(--ink-muted)]">Sign in to generate with credits and keep your style on every computer</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {account?.signed_in && <>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void act("sync")}>Sync now</Button>
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void act("sign_out")}>Sign out</Button>
        </>}
        {account && !account.signed_in && account.pending && <>
          {signInUrl ? <a className={buttonVariants({ variant: "outline", size: "sm" })} href={signInUrl} target="_blank" rel="noopener noreferrer">Open sign-in page</a>
            : <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void act("sign_in")}>Open sign-in page</Button>}
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void act("cancel")}>Cancel</Button>
        </>}
        {account && !account.signed_in && !account.pending &&
          <Button type="button" size="sm" disabled={busy} onClick={() => void act("sign_in")}>Sign in</Button>}
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {account?.signed_in && membership?.member === false && membership.offer && <div className="border-t border-border pt-4"><MembershipOffer membership={membership} /></div>}
  </section>;
}


/** User page header: who is signed in, or one Sign in action, on every tab. */
export function CloudAccountBadge({ action = true }: { action?: boolean } = {}) {
  const { account, busy, act } = useCloudAccount();
  if (!account) return null;
  if (account.signed_in) return <p className="memory-account-line" title={account.style_sync?.error ? `Style not synced: ${account.style_sync.error}` : undefined}>{account.email || "Signed in"}</p>;
  return <p className="memory-account-line">{account.pending ? "Waiting for your browser" : "Not signed in"}
    {action && !account.pending && <Button type="button" variant="link" size="sm" disabled={busy} onClick={() => void act("sign_in")}>Sign in</Button>}</p>;
}
