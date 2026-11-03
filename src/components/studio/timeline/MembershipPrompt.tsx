"use client";
import { useEffect, useState } from "react";
import { Check, ExternalLink } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Membership } from "@/lib/cloud/membership";
import { useCloudAccount, type CloudAccountView } from "./CloudAccountSettings";

const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** Membership state for the signed-in creator; refetched when the account changes. */
export function useMembership(account: CloudAccountView | null) {
  const [membership, setMembership] = useState<Membership | null>(null);
  const signedIn = account?.signed_in ?? null;
  const email = account?.email ?? null;
  useEffect(() => {
    if (signedIn === null) return;
    let live = true;
    fetch("/api/user/membership", { cache: "no-store" }).then(response => response.ok ? response.json() : null)
      .then(next => { if (live) setMembership(next); }).catch(() => { if (live) setMembership(null); });
    return () => { live = false; };
  }, [signedIn, email]);
  return membership;
}

/** The membership offer: price, benefits and the way to subscribe on dreamcut.io. */
export function MembershipOffer({ membership }: { membership: Membership }) {
  const offer = membership.offer!;
  return <div className="space-y-3 text-sm">
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <h3 className="font-semibold text-[var(--ink)]">DreamCut membership</h3>
      <span className="flex items-baseline gap-2">
        {offer.regular_cents > offer.cents && <s className="text-base text-[var(--ink-secondary)]"><span className="sr-only">Regular price </span>{dollars(offer.regular_cents)}</s>}
        <span className="text-base font-semibold text-[var(--ink)]">{dollars(offer.cents)}</span>
        <span className="text-[var(--ink-secondary)]">/ month</span>
      </span>
      {offer.regular_cents > offer.cents && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">Limited time</span>}
    </div>
    <ul className="space-y-1.5">
      {offer.benefits.map(benefit => <li key={benefit} className="flex items-start gap-2 text-[var(--ink)]"><Check size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--ink)]" />{benefit}</li>)}
    </ul>
    <a className={buttonVariants({ size: "sm" })} href={membership.subscribe_url} target="_blank" rel="noopener noreferrer">Become a member<ExternalLink aria-hidden="true" /><span className="sr-only"> (opens dreamcut.io)</span></a>
  </div>;
}

/** My style: sign in when signed out; the membership offer when signed in without one; nothing for members. */
export function StyleMembershipPrompt() {
  const { account, busy, act } = useCloudAccount();
  const membership = useMembership(account);
  if (!account) return null;
  if (!account.signed_in) return <section className="memory-card space-y-3 text-sm" aria-label="Sign in">
    <h3 className="font-semibold text-[var(--ink)]">Sign in to DreamCut</h3>
    <p className="text-[var(--ink-secondary)]">Keep your style on every computer and generate with credits</p>
    {account.pending
      ? <p role="status">Waiting for your browser</p>
      : <Button type="button" size="sm" disabled={busy} onClick={() => void act("sign_in")}>Sign in</Button>}
  </section>;
  if (membership?.member !== false || !membership.offer) return null;
  return <section className="memory-card" aria-label="DreamCut membership"><MembershipOffer membership={membership} /></section>;
}
