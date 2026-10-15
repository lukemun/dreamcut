import { z } from "zod";
import type { GuideEffect } from "./guide";
import { cloudBaseUrl } from "@/lib/cloud/base-url";

export { DEFAULT_CLOUD_URL, cloudBaseUrl } from "@/lib/cloud/base-url";

/** Community recipes are shared through DreamCut Cloud and moderated before publication. */
const TIMEOUT_MS = 1500;
const FRESH_MS = 5 * 60 * 1000;
/** A missing or unreachable service is retried after a minute, not on every Library load. */
const FAILURE_MS = 60 * 1000;
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const text = (max: number) => z.string().trim().min(1).max(max);
const slug = z.string().regex(/^[a-z0-9-]{1,80}$/);
const httpsUrl = z.string().url().max(4096).refine(value => value.startsWith("https://"), "Media must be served over HTTPS");
const scalar = z.union([z.string().max(1000), z.number().finite(), z.boolean()]);

const communityRecipeSchema = z.object({
  id: z.string().uuid(),
  title: text(100), description: text(500), skill: slug,
  author: z.object({ name: text(60) }),
  video: httpsUrl, poster: httpsUrl,
  recipe: z.object({
    prompt: text(2000),
    preparation: text(2000).optional(),
    needs: z.array(text(300)).max(20).optional(),
    use_cases: z.array(text(200)).max(10).optional(),
    input_directions: z.array(z.object({ title: text(100), directions: text(2000) })).max(20).optional(),
    limitations: z.array(text(500)).max(20).optional(),
    family: z.object({ title: text(100), variant: text(100) }).optional(),
    bundles: z.array(z.object({
      skill: slug, recipe_id: z.string().max(80).optional(),
      parameters: z.record(z.string().max(80), scalar),
    })).max(30).optional(),
  }),
});
export type CommunityRecipe = z.infer<typeof communityRecipeSchema>;

const keyPart = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "x";

/** Local URL for community example media; the editor proxies it so it works like every other recipe example. */
export function communityMediaUrl(id: string, kind: "video" | "poster") {
  return `/api/guide/community-effects/${encodeURIComponent(id)}/media?kind=${kind}`;
}

type CommunityMedia = { video: string; poster: string };
type Parsed = { effect: GuideEffect; media: CommunityMedia };

function parseCommunityRecipe(value: unknown): Parsed | null {
  const parsed = communityRecipeSchema.safeParse(value);
  if (!parsed.success) return null;
  const { id, title, description, skill, author, video, poster, recipe } = parsed.data;
  return {
    media: { video, poster },
    effect: {
      id: `community-${id}`, origin: "shared", source: "community", author: author.name,
      skill, title, description, video: communityMediaUrl(id, "video"), poster: communityMediaUrl(id, "poster"),
      inputs: [], needs: recipe.needs, useCases: recipe.use_cases,
      inputDirections: recipe.input_directions, preparation: recipe.preparation,
      prompt: recipe.prompt, limitations: recipe.limitations, bundles: recipe.bundles,
      family: recipe.family && { id: `community-${keyPart(author.name)}-${keyPart(recipe.family.title)}`, ...recipe.family },
      credit: author.name,
    },
  };
}

/** Maps one published Cloud recipe to the Library's recipe shape. Invalid entries are dropped. */
export function communityRecipeToGuideEffect(value: unknown): GuideEffect | null {
  return parseCommunityRecipe(value)?.effect ?? null;
}

function parseListing(body: unknown) {
  const recipes = (body as { recipes?: unknown } | null)?.recipes;
  if (!Array.isArray(recipes)) return [];
  return recipes.slice(0, 500).map(parseCommunityRecipe).filter((item): item is Parsed => item !== null);
}

/** Accepts the listing body; anything unexpected yields no community recipes. */
export function communityGuideEffects(body: unknown): GuideEffect[] {
  return parseListing(body).map(item => item.effect);
}

type Cache = { at: number; ok: boolean; effects: GuideEffect[]; media: Map<string, CommunityMedia> };
let cache: Cache | undefined;
let inflight: Promise<GuideEffect[]> | undefined;
type FetchOptions = { baseUrl?: string; fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number };

/** Published community recipes, cached in memory. Never throws: failures return the last good list or none. */
export async function fetchCommunityRecipes(options: FetchOptions = {}) {
  const now = options.now ?? Date.now;
  if (cache && now() - cache.at < (cache.ok ? FRESH_MS : FAILURE_MS)) return cache.effects;
  if (inflight) return inflight;
  const pending = (async () => {
    const previous = cache;
    try {
      const response = await (options.fetchImpl ?? fetch)(`${options.baseUrl ?? cloudBaseUrl()}/api/v1/recipes`, {
        signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Community recipes: ${response.status}`);
      if (Number(response.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) throw new Error("Community recipes: response too large");
      const items = parseListing(await response.json());
      cache = { at: now(), ok: true, effects: items.map(item => item.effect), media: new Map(items.map(item => [item.effect.id!.slice("community-".length), item.media])) };
    } catch {
      cache = { at: now(), ok: false, effects: previous?.effects ?? [], media: previous?.media ?? new Map() };
    }
    return cache.effects;
  })();
  inflight = pending;
  void pending.finally(() => { if (inflight === pending) inflight = undefined; });
  return pending;
}

/** The remote example a listed community recipe points to, by identity only. */
export async function communityMediaSource(id: string, kind: string, options: FetchOptions = {}) {
  if (!/^[0-9a-f-]{36}$/.test(id) || (kind !== "video" && kind !== "poster")) return null;
  await fetchCommunityRecipes(options);
  const url = cache?.media.get(id)?.[kind];
  return url && isCommunityMediaHost(url, options.baseUrl ?? cloudBaseUrl()) ? url : null;
}

/** The editor only proxies example media from DreamCut Cloud storage, never an arbitrary host. */
export function isCommunityMediaHost(url: string, baseUrl: string) {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && (hostname.endsWith(".supabase.co") || hostname === new URL(baseUrl).hostname);
  } catch { return false; }
}

/** Test hook. */
export function resetCommunityRecipeCache() {
  cache = undefined;
  inflight = undefined;
}
