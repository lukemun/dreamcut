/** DreamCut Cloud origin shared by every editor feature that talks to it (accounts, style sync,
 * evidence, shared recipes). `DREAMCUT_CLOUD_URL` points a development editor at another site. */
export const DEFAULT_CLOUD_URL = "https://dreamcut.io";

export function cloudBaseUrl(env: Record<string, string | undefined> = process.env) {
  return (env.DREAMCUT_CLOUD_URL?.trim() || DEFAULT_CLOUD_URL).replace(/\/+$/, "");
}

/** Where a creator buys generation credits (opened in the system browser). */
export const BUY_CREDITS_URL = `${DEFAULT_CLOUD_URL}/pricing`;
