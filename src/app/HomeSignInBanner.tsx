"use client";

import { Button } from "@/components/ui/button";
import { useCloudAccount } from "@/components/studio/timeline/CloudAccountSettings";

/** Home: a bright call to sign in, shown only while this editor is signed out of DreamCut. */
export function HomeSignInBanner() {
  const { account, busy, signInUrl, act } = useCloudAccount();
  if (!account || account.signed_in) return null;
  return <section className="home-sign-in" aria-label="Sign in to DreamCut">
    <div className="home-sign-in-text">
      <h2>Sign in to DreamCut</h2>
      <p>Keep your style on every computer and generate with credits</p>
    </div>
    {account.pending
      ? <p role="status" className="home-sign-in-status">
          Waiting for your browser{signInUrl && <> · <a href={signInUrl} target="_blank" rel="noopener noreferrer">Open sign-in</a></>}
        </p>
      : <Button type="button" size="sm" className="home-sign-in-action" disabled={busy} onClick={() => void act("sign_in")}>Sign in</Button>}
  </section>;
}
