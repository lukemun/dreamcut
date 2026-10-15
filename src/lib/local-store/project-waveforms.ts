import fs from "node:fs";
import path from "node:path";
import { mediaFileSha256, resolveLocalMediaSource } from "./audio-effects";
import { readProjectSourceManifest } from "./media-ingest";
import { projectDir, projectMediaDir } from "./paths";
import { prepareWaveform, resolveWaveformSource } from "./prepare-waveform";
import { readTimeline, readPeaks, writePeaks, withProjectLock, type PeaksEntry } from "./store";
import { AUDIO_PEAK_ELEMENT_TYPES } from "../timeline/peaks";

/** Timeline references retain their existing authority; unused media requires verified import provenance. */
function authorizedSource(projectId: string, sourceUrl: string): string {
  const active = readTimeline(projectId).elements.some(e => !e.removed_at
    && AUDIO_PEAK_ELEMENT_TYPES.has(e.type) && e.source_url === sourceUrl);
  const source = resolveWaveformSource(projectId, sourceUrl);
  if (!source) throw new Error("Source is not local");
  if (active) return source;
  const url = new URL(sourceUrl, "http://localhost");
  const local = resolveLocalMediaSource(projectId, url.pathname);
  const asset = local && readProjectSourceManifest(projectId).assets.find(a =>
    a.storage_mode === "managed_copy" && a.media_path === local.relativePath);
  if (!asset) throw new Error("Source must be active in the timeline or a managed import in this project");
  const mediaRoot = fs.realpathSync(projectMediaDir(projectId));
  if (!fs.realpathSync(source).startsWith(mediaRoot + path.sep)) throw new Error("Managed source escapes project media");
  if (mediaFileSha256(source) !== asset.source_sha256) throw new Error("Imported source has changed; re-import it before preparation");
  return source;
}

export async function prepareProjectWaveforms(projectId: string, sources: string[]) {
  const items: (PeaksEntry & { source_url: string })[] = [];
  const errors: { source_url: string; error: string }[] = [];
  // Source-wide cached analysis only. Never hold the editorial lock during extraction.
  for (const source_url of new Set(sources)) {
    try {
      const source = authorizedSource(projectId, source_url);
      const fingerprint = mediaFileSha256(source);
      const entry = await prepareWaveform(source, path.join(projectDir(projectId), "preprocess", "waveforms"));
      await withProjectLock(projectId, async () => {
        const current = authorizedSource(projectId, source_url);
        if (current !== source || mediaFileSha256(current) !== fingerprint) throw new Error("Source changed during preparation; retry with the current source");
        const peaks = readPeaks(projectId);
        peaks[source_url] = entry;
        writePeaks(projectId, peaks);
      });
      items.push({ source_url, ...entry });
    } catch (error) {
      errors.push({ source_url, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { items, errors };
}
