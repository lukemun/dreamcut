import { readEnv } from "@/lib/env-name";

/**
 * DEVELOPMENT AND TEST ONLY. DreamCut generates through DreamCut Cloud with purchased credits; creators never
 * supply a provider key and the editor UI never mentions one.
 *
 * A developer can make the asset worker call fal directly, bypassing Cloud and credits, by setting BOTH
 * `DREAMCUT_DEV_DIRECT_FAL=1` and a key in `DREAMCUT_FAL_KEY` (or `FAL_KEY`). A key alone does nothing, so an
 * old `.env` from the bring-your-own-key era cannot silently skip credits. Requests still need the Generate click
 * and an accepted Cloud price; only the transport changes, and fal bills the developer's own account.
 */
export function developmentFalKey(env: Record<string, string | undefined> = process.env): string | undefined {
  if (readEnv("DEV_DIRECT_FAL", env)?.trim() !== "1") return undefined;
  return readEnv("FAL_KEY", env)?.trim() || env.FAL_KEY?.trim() || undefined;
}
