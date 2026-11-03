/** Whether the signed-in creator is a DreamCut member, and the offer to show when not. Both come
 * from DreamCut Cloud so the editor never carries its own copy of the price or benefits. */
import { z } from "zod";
import { cloudBaseUrl } from "./base-url";
import { cloudAccountStatus, cloudFetch, type Fetcher } from "@/lib/local-store/cloud-account";

const offerSchema = z.object({ name: z.string(), cents: z.number(), regular_cents: z.number(), benefits: z.array(z.string()).max(12) });
export type MembershipOffer = z.infer<typeof offerSchema>;
export type Membership = {
  signed_in: boolean;
  /** null when DreamCut Cloud could not be reached or could not check billing. */
  member: boolean | null;
  offer: MembershipOffer | null;
  subscribe_url: string;
};

const TTL_MS = 5 * 60 * 1000;
let cached: { key: string; at: number; value: Membership } | null = null;

export async function cloudMembership(fetcher: Fetcher = fetch, now = Date.now()): Promise<Membership> {
  const account = cloudAccountStatus();
  const key = `${cloudBaseUrl()}|${account.signed_in ? account.email ?? "" : ""}`;
  if (cached?.key === key && now - cached.at < TTL_MS) return cached.value;
  const [offer, member] = await Promise.all([
    fetcher(`${cloudBaseUrl()}/api/v1/membership`, { signal: AbortSignal.timeout(10_000) })
      .then(response => response.ok ? response.json() : null).then(body => offerSchema.nullable().parse(body)).catch(() => null),
    account.signed_in
      ? cloudFetch("/api/v1/me", {}, fetcher).then(response => response.ok ? response.json() : null)
        .then(body => typeof body?.member === "boolean" ? body.member as boolean : null).catch(() => null)
      : Promise.resolve(null),
  ]);
  const value: Membership = { signed_in: account.signed_in, member, offer, subscribe_url: `${cloudBaseUrl()}/account?buy=monthly` };
  // A failed lookup is retried on the next read instead of being remembered.
  if (offer && (!account.signed_in || member !== null)) cached = { key, at: now, value };
  return value;
}
