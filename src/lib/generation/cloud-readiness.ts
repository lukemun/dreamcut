/** What stands between a draft and Generate: model, price, sign-in, credits. Read-only: never charges. */
import { BUY_CREDITS_URL } from "@/lib/cloud/base-url";
import { CloudSignedOutError, cloudAccountStatus } from "@/lib/local-store/cloud-account";
import { validateAssetRequest, type AssetDraft } from "./assets";
import { cloudUnavailableMessage, getAssetModel } from "./asset-models";
import { cloudCreditBalance, quoteCloudDraft, type CloudQuote } from "./cloud-generation";
import { developmentFalKey } from "./development-fal-key";

export type GenerationReadiness = "ready" | "sign_in" | "buy_credits" | "model_unavailable" | "incomplete" | "price_unavailable";
export type GenerationCheck = {
  readiness: GenerationReadiness;
  /** The price in credits for exactly this draft, from DreamCut Cloud. */
  quote: CloudQuote | null;
  signed_in: boolean;
  /** Credit balance when signed in and reachable. */
  balance: number | null;
  message: string | null;
  buy_credits_url: string;
};

export async function checkGeneration(draft: AssetDraft): Promise<GenerationCheck> {
  const account = cloudAccountStatus();
  const development = developmentFalKey() !== undefined;
  const signedIn = account.signed_in || development;
  const result = (readiness: GenerationReadiness, message: string | null, quote: CloudQuote | null = null, balance: number | null = null): GenerationCheck =>
    ({ readiness, quote, signed_in: account.signed_in, balance, message, buy_credits_url: BUY_CREDITS_URL });
  const model = getAssetModel(draft);
  if (model.cloud === false) return result("model_unavailable", cloudUnavailableMessage(model.name));
  try { validateAssetRequest(draft); } catch (error) { return result("incomplete", (error as Error).message); }
  let quote: CloudQuote;
  try { quote = await quoteCloudDraft(draft); }
  catch (error) { return result("price_unavailable", error instanceof Error ? error.message : "The price is unavailable."); }
  if (!signedIn) return result("sign_in", "Sign in or create a DreamCut account to generate.", quote);
  if (development && !account.signed_in) return result("ready", null, quote);
  let balance: number | null = null;
  try { balance = await cloudCreditBalance(); }
  catch (error) {
    // A revoked session ends here; otherwise Generate still works and the Cloud checks the balance itself.
    if (error instanceof CloudSignedOutError) return { ...result("sign_in", "Sign in or create a DreamCut account to generate.", quote), signed_in: false };
  }
  if (balance !== null && balance < quote.credits) return result("buy_credits", `This costs ${quote.credits} credits and you have ${balance}.`, quote, balance);
  return result("ready", null, quote, balance);
}
