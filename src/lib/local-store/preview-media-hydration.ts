import { enqueueMediaPreparation, readPreparation } from "./media-preparation";
import { validatePreviewProxy } from "./preview-proxy-validation";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { preparationSourcePath } from "./media-preparation";
import { resolveVisualCatalogFile, visualCatalogMediaRoot } from "./visual-catalog";
import {
  ensurePreviewAudioClock,
  ensureReversedPreviewAudio,
  resolveLocalMediaSource,
} from "./audio-effects";

const catalogCopies = new Map<string, string>();

function previewInputHash(file: string): string {
  const digest = createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buffer = Buffer.alloc(1024 * 1024);
  try {
    for (;;) {
      const count = fs.readSync(fd, buffer);
      if (!count) break;
      digest.update(buffer.subarray(0, count));
    }
  } finally { fs.closeSync(fd); }
  return digest.digest("hex");
}

/** Disposable input for proxy preparation; the catalog remains export authority. */
function catalogPreviewInput(projectId: string, url: string): string | null {
  const prefix = "/api/visual-catalog/media/";
  if (!url.startsWith(prefix)) return null;
  const relativeFile = decodeURIComponent(url.slice(prefix.length));
  const file = fs.realpathSync(resolveVisualCatalogFile(relativeFile));
  const root = fs.realpathSync(visualCatalogMediaRoot(relativeFile));
  if (!file.startsWith(root + path.sep)) throw new Error("Catalog source must stay inside its media directory");
  const stat = fs.statSync(file);
  if (!stat.isFile() || !/\.(mp4|mov|webm|m4v)$/i.test(file)) throw new Error("Catalog source is not a video");
  const key = `${projectId}:${file}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
  const cached = catalogCopies.get(key);
  if (cached && fs.existsSync(preparationSourcePath(projectId, cached))) return cached;
  const sourceHash = previewInputHash(file);
  const relative = `.preview-sources/catalog/${sourceHash}${path.extname(file).toLowerCase()}`;
  const destination = preparationSourcePath(projectId, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  try { fs.copyFileSync(file, destination, fs.constants.COPYFILE_EXCL); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  if (previewInputHash(destination) !== sourceHash) throw new Error("Catalog preview cache does not match its source");
  const after = fs.statSync(file);
  if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) {
    throw new Error("Catalog source changed during preview preparation; retry");
  }
  if (catalogCopies.size >= 256) catalogCopies.clear();
  catalogCopies.set(key, relative);
  return relative;
}

function hydrateLegacyTreatedPreviewAudio(
  projectId: string,
  sourceUrl: string | null,
  props: Record<string, unknown>,
) {
  const declaredAudio = props.preview_audio_source_url;
  const hasAudioTreatment = (
    (typeof props.voice_enhancement === "object"
      && props.voice_enhancement != null
      && (props.voice_enhancement as Record<string, unknown>).enabled !== false)
    || (typeof props.audio_cleanup === "object" && props.audio_cleanup != null)
    || (typeof props.loudness_normalization === "object" && props.loudness_normalization != null)
  );
  // Older treatment routes used the full muxed render file as the supposedly
  // dedicated preview clock. Repair that disposable cache binding on read;
  // the durable treatment and render authority remain untouched.
  if (!hasAudioTreatment || typeof sourceUrl !== "string" || declaredAudio !== sourceUrl) {
    return props;
  }
  try {
    const treated = resolveLocalMediaSource(projectId, sourceUrl, {
      allowReferencedProject: true,
    });
    if (!treated) return props;
    const clock = ensurePreviewAudioClock(projectId, treated.absolutePath);
    return {
      ...props,
      runtime_preview_audio_source_url: clock.sourceUrl,
    };
  } catch {
    return props;
  }
}

/** Disposable preview-cache resolution, not an editorial/source-authority edit. */
export function hydrateVideoPreview(projectId: string, sourceUrl: string | null, props: Record<string, unknown>) {
  return withReversedPreviewAudio(projectId, sourceUrl, hydrateForwardVideoPreview(projectId, sourceUrl, props));
}

/** A reversed clip previews its sound from a prepared backward track; without one it stays silent in preview. */
function withReversedPreviewAudio(projectId: string, sourceUrl: string | null, props: Record<string, unknown>) {
  if (props.playback_reverse !== true || props.runtime_source_has_audio === false) return props;
  const forward = [props.runtime_preview_audio_source_url, props.preview_audio_source_url, sourceUrl].find((value): value is string => typeof value === "string" && value.length > 0);
  if (!forward) return props;
  try {
    const local = resolveLocalMediaSource(projectId, forward, { allowReferencedProject: true });
    const reversed = local ? ensureReversedPreviewAudio(projectId, local.absolutePath) : null;
    return reversed ? { ...props, runtime_preview_audio_reverse_source_url: reversed.sourceUrl,
      runtime_preview_audio_reverse_duration: reversed.sourceDurationSeconds } : props;
  } catch { return props; }
}

function hydrateForwardVideoPreview(projectId: string, sourceUrl: string | null, props: Record<string, unknown>) {
  props = hydrateLegacyTreatedPreviewAudio(projectId, sourceUrl, props);
  // Source capability, not gain: a muted clip still has editable audio.
  // Read only a fresh preparation receipt; absence of a receipt means unknown.
  const sourcePrefix = `/api/projects/${projectId}/media/`;
  const source = typeof props.archival_source_url === "string" ? props.archival_source_url : sourceUrl;
  if (source?.startsWith(sourcePrefix)) {
    try {
      const prepared = readPreparation(projectId, decodeURIComponent(source.slice(sourcePrefix.length)));
      if (prepared?.state === "ready") {
        const renderUrl = sourcePrefix + prepared.render?.split("/").map(encodeURIComponent).join("/");
        if (sourceUrl === source || sourceUrl === renderUrl) {
          props = { ...props, runtime_source_has_audio: Boolean(prepared.audio) };
        }
      }
    } catch { /* Unknown source capability keeps the audio controls available. */ }
  }
  const validation = validatePreviewProxy(props.preview_source_url, props.has_alpha === true);
  if (validation.ok) return { ...props, preview_proxy_validation: validation };
  const prefix = `/api/projects/${projectId}/media/`;
  try {
    const archival = typeof props.archival_source_url === "string" ? props.archival_source_url : sourceUrl;
    if (!archival) throw new Error("Import this source locally to prepare its preview.");
    const catalogInput = archival.startsWith(prefix) ? null : catalogPreviewInput(projectId, archival);
    if (!archival.startsWith(prefix) && !catalogInput) throw new Error("Import this source locally to prepare its preview.");
    const relative = catalogInput ?? decodeURIComponent(archival.slice(prefix.length));
    let packageInfo = readPreparation(projectId, relative) ?? enqueueMediaPreparation(projectId, relative);
    const url = (p: string) => prefix + p.split("/").map(encodeURIComponent).join("/");
    // Preparing resumes the worker; a ready package whose preview is HDR is prepared again.
    if (packageInfo?.state === "preparing"
      || (packageInfo?.state === "ready" && packageInfo.preview && validatePreviewProxy(url(packageInfo.preview), packageInfo.alpha === true).hdr)) {
      packageInfo = enqueueMediaPreparation(projectId, relative) ?? packageInfo;
    }
    if (sourceUrl !== archival && sourceUrl !== (packageInfo?.render && url(packageInfo.render))) throw new Error("Prepared source does not match this clip.");
    if (packageInfo?.state !== "ready" || !packageInfo.preview) return { ...props,
      preview_proxy_validation: validation,
      runtime_preview_preparation: { state: packageInfo?.state ?? "failed", error: packageInfo?.error },
    };
    const preview = url(packageInfo.preview);
    return { ...props,
      runtime_preview_source_url: preview,
      // Keep explicitly authored audio treatment when present.
      ...(!props.preview_audio_source_url && packageInfo.audio ? { runtime_preview_audio_source_url: url(packageInfo.audio) } : {}),
      preview_proxy_validation: validatePreviewProxy(preview, packageInfo.alpha === true, packageInfo.prepared_preview_quality),
      runtime_preview_preparation: { state: "ready" },
    };
  } catch (error) {
    return { ...props, preview_proxy_validation: validation,
      runtime_preview_preparation: { state: "failed", error: error instanceof Error ? error.message : String(error) },
    };
  }
}
