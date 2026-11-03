import type { SfxCatalogEntry } from "./schema";

/**
 * Ranked search over the SFX catalog for agents. Pure scoring over catalog metadata:
 * text, editorial motion and intensity, duration and measured audibility. Ranking is a
 * shortlist for audition, never proof a sound fits; the creator listens in review.
 */

export const SFX_ROLES = ["entrance_accent", "movement", "payoff", "reaction", "interface", "texture"] as const;
export type SfxRole = (typeof SFX_ROLES)[number];

export type SfxSearchRequest = {
  query?: string;
  role?: SfxRole;
  intensity?: "light" | "medium" | "heavy";
  max_duration_seconds?: number;
  limit?: number;
};

export type SfxSearchHit = {
  id: string;
  /** True for the creator's own sounds from their personal library; absent for the shared catalog. */
  personal?: true;
  title: string;
  description: string | null;
  category: string;
  tags: string[];
  good_for: string[];
  avoid_for: string[];
  source_status: SfxCatalogEntry["source_status"];
  /** free: anyone may use it; members: DreamCut members only. */
  access: "free" | "members";
  source_url: string;
  duration_seconds: number;
  sample_rate_hz: number;
  channels: number;
  editorial: SfxCatalogEntry["editorial"] | null;
  analysis: {
    integrated_lufs: number | null;
    true_peak_dbtp: number | null;
    audibility_status: string | null;
    active_start_seconds: number | null;
    active_end_seconds: number | null;
    peak_time_seconds: number | null;
    peak_position: string | null;
    spectral_centroid_hz: number | null;
  };
  score: number;
  matched: string[];
};

const STOPWORDS = new Set(["a", "an", "the", "for", "of", "to", "and", "or", "with", "on", "in", "sound", "sfx", "effect", "effects", "some", "like"]);

/** Editors' words for the same sound; each group expands to all its members. */
const SYNONYMS: string[][] = [
  ["whoosh", "swoosh", "swish", "woosh", "swipe", "swoop", "transition"],
  ["hit", "impact", "boom", "thud", "punch", "slam", "bang"],
  ["riser", "rise", "build", "buildup", "uplifter", "swell"],
  ["click", "tap", "ui", "button", "interface", "notification", "ping", "ding"],
  ["pop", "bubble", "blip"],
  ["glitch", "digital", "error", "static"],
  ["cash", "register", "money", "coin"],
  ["shimmer", "sparkle", "magic", "chime"],
  ["slice", "cut", "slash", "blade", "razor"],
];

const ROLE_MOTION: Record<SfxRole, string[]> = {
  entrance_accent: ["hit", "in_out", "other"],
  movement: ["in_out", "out", "rise"],
  payoff: ["hit", "rise"],
  reaction: ["hit", "other"],
  interface: ["hit", "other"],
  texture: ["texture"],
};

const ROLE_TERMS: Record<SfxRole, string[]> = {
  entrance_accent: ["pop", "hit", "whoosh", "accent", "reveal"],
  movement: ["whoosh", "transition", "slide", "sweep"],
  payoff: ["impact", "boom", "reveal", "riser", "hit"],
  reaction: ["meme", "reaction", "comedy", "funny"],
  interface: ["ui", "click", "notification", "tap"],
  texture: ["ambience", "texture", "loop", "bed"],
};

export function sfxTokens(text: string): string[] {
  return text.normalize("NFKC").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

export function expandTokens(tokens: string[]): Set<string> {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    for (const group of SYNONYMS) {
      if (group.some((word) => word === token || (token.length > 3 && word.startsWith(token)))) group.forEach((word) => expanded.add(word));
    }
  }
  return expanded;
}

function fieldTokens(values: Array<string | undefined | null>): Set<string> {
  return new Set(values.flatMap((value) => (value ? sfxTokens(value) : [])));
}

export function sfxMediaUrl(file: string): string {
  return `/api/sfx-catalog/media/${file.split("/").map(encodeURIComponent).join("/")}`;
}

export function scoreSfxEntry(entry: SfxCatalogEntry, request: SfxSearchRequest): { score: number; matched: string[] } | null {
  const active = entry.analysis
    ? Math.max(0, entry.analysis.active_end_seconds - entry.analysis.active_start_seconds)
    : entry.duration_seconds;
  if (request.max_duration_seconds !== undefined && Math.min(active, entry.duration_seconds) > request.max_duration_seconds) return null;

  const query = expandTokens(sfxTokens(request.query ?? ""));
  const roleTerms = request.role ? new Set(ROLE_TERMS[request.role]) : new Set<string>();
  const title = fieldTokens([entry.title]);
  const tags = fieldTokens(entry.tags);
  const goodFor = fieldTokens(entry.good_for);
  const avoidFor = fieldTokens(entry.avoid_for);
  const description = fieldTokens([entry.description, entry.category, ...(entry.editorial?.texture ?? [])]);

  let score = 0;
  const matched = new Set<string>();
  for (const term of query) {
    if (title.has(term)) { score += 3; matched.add(term); }
    if (tags.has(term)) { score += 2.5; matched.add(term); }
    if (goodFor.has(term)) { score += 1.5; matched.add(term); }
    if (description.has(term)) { score += 1; matched.add(term); }
    if (avoidFor.has(term)) score -= 2;
  }
  // A query that matches nothing in a sound's own words is not a result.
  if (query.size > 0 && matched.size === 0) return null;
  for (const term of roleTerms) {
    if (title.has(term) || tags.has(term) || goodFor.has(term)) score += 0.75;
  }
  if (request.role && entry.editorial?.motion && ROLE_MOTION[request.role].includes(entry.editorial.motion)) score += 1.5;
  if (request.intensity && entry.editorial?.intensity) score += entry.editorial.intensity === request.intensity ? 1 : -1;
  switch (entry.analysis?.audibility_status) {
    case "silent": score -= 5; break;
    case "too_quiet": score -= 2; break;
    case "sparse": score -= 0.5; break;
    default: break;
  }
  return { score: Math.round(score * 100) / 100, matched: [...matched].sort() };
}

export function searchSfxCatalog(entries: SfxCatalogEntry[], request: SfxSearchRequest): SfxSearchHit[] {
  const limit = Math.max(1, Math.min(20, request.limit ?? 8));
  return entries.flatMap((entry) => {
    const scored = scoreSfxEntry(entry, request);
    return scored ? [{ entry, ...scored }] : [];
  })
    .sort((a, b) => b.score - a.score || a.entry.duration_seconds - b.entry.duration_seconds || a.entry.id.localeCompare(b.entry.id))
    .slice(0, limit)
    .map(({ entry, score, matched }) => ({
      id: entry.id,
      ...(entry.personal ? { personal: true as const } : {}),
      title: entry.title,
      description: entry.description ?? null,
      category: entry.category,
      tags: entry.tags,
      good_for: entry.good_for,
      avoid_for: entry.avoid_for,
      source_status: entry.source_status,
      access: entry.access ?? "free",
      source_url: sfxMediaUrl(entry.file),
      duration_seconds: entry.duration_seconds,
      sample_rate_hz: entry.sample_rate_hz,
      channels: entry.channels,
      editorial: entry.editorial ?? null,
      analysis: {
        integrated_lufs: entry.analysis?.integrated_lufs ?? null,
        true_peak_dbtp: entry.analysis?.true_peak_dbtp ?? null,
        audibility_status: entry.analysis?.audibility_status ?? null,
        active_start_seconds: entry.analysis?.active_start_seconds ?? null,
        active_end_seconds: entry.analysis?.active_end_seconds ?? null,
        peak_time_seconds: entry.analysis?.peak_time_seconds ?? null,
        peak_position: entry.analysis?.peak_position ?? null,
        spectral_centroid_hz: entry.analysis?.spectral_centroid_hz ?? null,
      },
      score,
      matched,
    }));
}
