import { activeElements, readTimeline } from "../local-store/store";
import { readSourceMediaContext, summarizeSourceMediaContext } from "../local-store/media-context";
import { reconcileAssetBindings } from "../local-store/media-analysis";
import { readProjectSourceManifest } from "../local-store/media-ingest";
import { videoCatalogDescription } from "../local-store/video-descriptions";
import type { AssetBinding } from "./schema";

export function sourceIntervalForTimelineClip(clip: {
  trim_start: number;
  trim_end: number | null;
  duration: number;
  playback_rate: number;
  source_duration_seconds?: number | null;
}): [number, number] {
  const sourceStart = Math.max(0, clip.trim_start);
  const inferredEnd = sourceStart + clip.duration * Math.max(0.000001, clip.playback_rate);
  // Timeline trim_end is the amount removed from the source tail, not an
  // absolute source timestamp. Duration remains the mounted interval authority.
  const sourceLimit = typeof clip.source_duration_seconds === "number" && Number.isFinite(clip.source_duration_seconds)
    ? Math.max(sourceStart, clip.source_duration_seconds - (clip.trim_end ?? 0))
    : Number.POSITIVE_INFINITY;
  const sourceEnd = Math.min(inferredEnd, sourceLimit);
  return [sourceStart, Math.max(sourceStart, sourceEnd)];
}

function decodedPath(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function sourceRelativePath(sourceUrl: string | null, projectId: string): string | null {
  if (!sourceUrl) return null;
  const withoutQuery = sourceUrl.split("?")[0] ?? sourceUrl;
  const marker = `/api/projects/${encodeURIComponent(projectId)}/media/`;
  const direct = withoutQuery.indexOf(marker);
  if (direct >= 0) return decodedPath(withoutQuery.slice(direct + marker.length));
  const generic = withoutQuery.indexOf("/media/");
  return generic >= 0 ? decodedPath(withoutQuery.slice(generic + "/media/".length)) : null;
}

function bindingForElement(
  element: { source_url: string | null; props: Record<string, unknown> | null },
  projectId: string,
  bindings: AssetBinding[],
): AssetBinding | null {
  const explicitContext = element.props?.media_context_ref;
  const contextFingerprint = explicitContext && typeof explicitContext === "object" && !Array.isArray(explicitContext)
    && typeof (explicitContext as Record<string, unknown>).context_id === "string"
    ? ((explicitContext as Record<string, unknown>).context_id as string).replace(/^sha256:/, "")
    : null;
  const propFingerprint = contextFingerprint ?? element.props?.source_sha256;
  if (typeof propFingerprint === "string") {
    const byFingerprint = bindings.find((asset) => asset.fingerprint_sha256 === propFingerprint);
    if (byFingerprint) return byFingerprint;
  }
  const originalSourceUrl = element.props?.original_source_url;
  if (typeof originalSourceUrl === "string") {
    const originalRelativePath = sourceRelativePath(originalSourceUrl, projectId);
    const original = originalRelativePath ? bindings.find((asset) => asset.relative_path === originalRelativePath) : null;
    if (original) return original;
  }
  const relativePath = sourceRelativePath(element.source_url, projectId);
  return relativePath ? bindings.find((asset) => asset.relative_path === relativePath) ?? null : null;
}

export function buildProjectMediaContextPack(projectId: string) {
  const importedSources = new Map(readProjectSourceManifest(projectId).assets.map(asset => [asset.media_path, asset]));
  // Semantic descriptions already establish verified source identity. The
  // detector pipeline is independent and need not run before agents can use it.
  const bindings = reconcileAssetBindings(projectId).assets.map(binding => {
    const source = importedSources.get(binding.relative_path);
    if (!source || !/\.(mov|mp4|m4v|webm)$/i.test(binding.relative_path)) return binding;
    const description = videoCatalogDescription(projectId, source.media_path, source.source_sha256);
    if (description.status === "ready") return { ...binding, fingerprint_sha256: source.source_sha256 };
    if (description.status === "stale" || description.status === "failed") return { ...binding, fingerprint_sha256: null };
    return binding;
  });
  const timeline = readTimeline(projectId);
  const contexts = new Map<string, ReturnType<typeof summarizeSourceMediaContext>>();
  for (const binding of bindings) {
    if (!binding.fingerprint_sha256 || contexts.has(binding.fingerprint_sha256)) continue;
    const context = readSourceMediaContext(binding.fingerprint_sha256);
    if (context) contexts.set(binding.fingerprint_sha256, summarizeSourceMediaContext(context));
  }
  for (const element of activeElements(timeline)) {
    const explicitContext = element.props?.media_context_ref;
    const explicitFingerprint = explicitContext && typeof explicitContext === "object" && !Array.isArray(explicitContext)
      && typeof (explicitContext as Record<string, unknown>).context_id === "string"
      ? ((explicitContext as Record<string, unknown>).context_id as string).replace(/^sha256:/, "")
      : null;
    const fingerprint = explicitFingerprint ?? (typeof element.props?.source_sha256 === "string" ? element.props.source_sha256 : null);
    if (!fingerprint || contexts.has(fingerprint)) continue;
    contexts.set(fingerprint, {
      schema_version: 1,
      context_id: `sha256:${fingerprint}`,
      source_fingerprint_sha256: fingerprint,
      source_size_bytes: null,
      probe: null,
      derivatives: [],
      datasets: [],
      evidence_status: "unavailable",
      reason: "The timeline retains the source identity, but no shared context manifest has been published yet.",
      updated_at: null,
    });
  }

  const assets = bindings.map((binding) => ({
    asset_id: binding.asset_id,
    relative_path: binding.relative_path,
    kind: binding.kind,
    context_id: binding.fingerprint_sha256 ? `sha256:${binding.fingerprint_sha256}` : null,
    context_status: binding.fingerprint_sha256
      ? contexts.has(binding.fingerprint_sha256) ? "available" : "missing_manifest"
      : "not_fingerprinted",
  }));

  const timelineBindings = activeElements(timeline).flatMap((element) => {
    if (!element.source_url) return [];
    const binding = bindingForElement(element, projectId, bindings);
    const explicitContext = element.props?.media_context_ref;
    const contextFingerprint = explicitContext && typeof explicitContext === "object" && !Array.isArray(explicitContext)
      && typeof (explicitContext as Record<string, unknown>).context_id === "string"
      ? ((explicitContext as Record<string, unknown>).context_id as string).replace(/^sha256:/, "")
      : null;
    const fingerprint = binding?.fingerprint_sha256 ?? contextFingerprint
      ?? (typeof element.props?.source_sha256 === "string" ? element.props.source_sha256 : null);
    if (!fingerprint) return [];
    const sourceRange = sourceIntervalForTimelineClip({
      ...element,
      source_duration_seconds: typeof element.props?.source_duration_seconds === "number"
        ? element.props.source_duration_seconds
        : null,
    });
    return [{
      element_id: element.id,
      asset_id: binding?.asset_id ?? null,
      context_id: `sha256:${fingerprint}`,
      source_range_seconds: sourceRange,
      timeline_range_seconds: [element.timeline_start, element.timeline_start + element.duration],
      playback_rate: element.playback_rate,
      spatial_projection_props: {
        media_scale: element.props?.media_scale ?? null,
        media_offset_x: element.props?.media_offset_x ?? null,
        media_offset_y: element.props?.media_offset_y ?? null,
        mask_inset: element.props?.mask_inset ?? null,
        flip_horizontal: element.props?.flip_horizontal ?? element.props?.flip_x ?? null,
      },
    }];
  });

  return {
    schema_version: 1,
    contract: {
      source_identity: "sha256",
      timebase: "source_seconds",
      shared_context_levels: ["L1", "L2"],
      project_guidance_is_separate: true,
      missing_evidence_semantics: "unknown_not_clear",
    },
    assets,
    contexts: [...contexts.values()],
    timeline_bindings: timelineBindings,
  };
}
