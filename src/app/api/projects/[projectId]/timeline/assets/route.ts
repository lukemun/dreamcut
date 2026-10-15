import { pageAssets } from "@/lib/library/asset-page";
import { NextResponse } from "next/server";
import { compressedJson } from "@/lib/local-store/compressed-json";
import { readPreparation, startPreparationWorker } from "@/lib/local-store/media-preparation";
import { videoCatalogDescription } from "@/lib/local-store/video-descriptions";
import { listImportJobs } from "@/lib/local-store/media-import-jobs";

import { imageCatalogFileExists, readImageCatalog } from "@/lib/local-store/image-catalog";
import { readLibraryAnnotations } from "@/lib/local-store/library-annotations";
import { readVisualCatalog, resolveVisualCatalogFile, visualCatalogFileExists } from "@/lib/local-store/visual-catalog";
import { importedMediaUrl, readProjectSourceManifest } from "@/lib/local-store/media-ingest";
import { customCutoutByRelativePath } from "@/lib/local-store/custom-cutouts";
import {
  hyperframesOverlayReceiptsByMediaPath,
  listHyperframesCompositions,
} from "@/lib/local-store/hyperframes-overlays";
import { listMediaFiles } from "@/lib/local-store/media";
import { readManifest, reconcileAssetBindings } from "@/lib/local-store/media-analysis";
import { musicCatalogFileExists, readMusicCatalog } from "@/lib/local-store/music-catalog";
import { readSfxCatalog, sfxCatalogFileExists } from "@/lib/local-store/sfx-catalog";
import { readSourceNotes } from "@/lib/local-store/source-notes";
import { readMetadata, readTimeline, readPeaks } from "@/lib/local-store/store";
import { probeHasAlphaChannel } from "@/lib/media-analysis/alpha-channel";
import { platformForDeliveryTarget, resolveMusicVersion } from "@/lib/music-catalog/schema";

type Params = { params: Promise<{ projectId: string }> };

// The media shelf, backed by the project's media/ folder: images and videos
// become visuals, audio becomes music tracks (files under media/sfx/ become
// sound effects). App-only concepts (beats, voice clips, book assets) are empty.
/** The catalog can list the same file under several ids (re-imported folders); show each picture once, preferring a copy that is on disk. */
function uniqueCatalogVisuals<T extends { file_available: boolean; type: string; name: string; width?: number | null; height?: number | null; catalog_metadata: { sha256?: string } }>(assets: T[]): T[] {
  const chosen = new Map<string, T>();
  for (const asset of assets) {
    const key = asset.catalog_metadata.sha256 || `${asset.type}:${asset.name}:${asset.width}x${asset.height}`;
    const current = chosen.get(key);
    if (!current || (!current.file_available && asset.file_available)) chosen.set(key, asset);
  }
  const keep = new Set(chosen.values());
  return assets.filter(asset => keep.has(asset));
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const timeline = readTimeline(projectId);
    const metadata = readMetadata(projectId);
    const media = listMediaFiles(projectId);
    const importedSearch = new Map(listImportJobs(projectId).filter(job => job.status === "complete").map(job => [job.media_path, job.search_text ?? ""]));
    const analysisBindings = reconcileAssetBindings(projectId);
    const analysisBindingByRelativePath = new Map(analysisBindings.assets.map((asset) => [asset.relative_path, asset]));
    const analysisByRelativePath = new Map(analysisBindings.assets.map((asset) => [
      asset.relative_path,
      asset.fingerprint_sha256 ? readManifest(asset.fingerprint_sha256) : null,
    ]));
    const catalog = readMusicCatalog();
    const sfxCatalog = readSfxCatalog();
    const imageCatalog = readImageCatalog();
    const visualCatalog = readVisualCatalog();
    const sourceManifest = readProjectSourceManifest(projectId);
    const libraryAnnotations = readLibraryAnnotations(projectId);
    const customCutouts = customCutoutByRelativePath(projectId);
    const hyperframesOverlays = hyperframesOverlayReceiptsByMediaPath(projectId);
    const platform = platformForDeliveryTarget(metadata.delivery_target);

    const visuals = media
      .filter((file) => !file.relPath.startsWith(".prepared/") && (file.kind === "image" || file.kind === "video"))
      .map((file) => {
        const customCutout = customCutouts.get(file.relPath);
        const bakedScratchpad = customCutout?.scratchpad_treatment;
        const hyperframesOverlay = hyperframesOverlays.get(file.relPath);
        const analysisBinding = analysisBindingByRelativePath.get(file.relPath);
        const libraryAnnotation = libraryAnnotations?.assets[file.relPath] ?? null;
        const preparation = file.kind === "video" ? readPreparation(projectId, file.relPath) : null;
        return {
          slot_id: `local:${file.relPath}`,
          upload_id: file.relPath,
          variation_id: null,
          beat_id: null,
          type: file.kind === "image" ? ("still" as const) : ("video_clip" as const),
          source_url: file.url,
          import_search_text: importedSearch.get(file.relPath) ?? "",
          preparation: file.kind === "video" ? preparation ?? { state: "imported" } : undefined,
          duration_seconds: preparation?.state === "ready" ? preparation.duration : customCutout?.output_duration_seconds ?? file.durationSeconds,
          is_approved: true,
          is_uploaded: true,
          name: bakedScratchpad ? `${file.name} · Baked outline` : file.name,
          library_annotation: libraryAnnotation,
          ...(file.kind === "video" ? { video_description: { ...videoCatalogDescription(projectId, file.relPath, sourceManifest.assets.find(asset => asset.media_path === file.relPath)?.source_sha256), frames: [] } } : {}),
          ...(file.width != null ? { width: file.width } : {}),
          ...(file.height != null ? { height: file.height } : {}),
          ...(file.kind === "video" && (customCutout || hyperframesOverlay || probeHasAlphaChannel(analysisByRelativePath.get(file.relPath)?.probe))
            ? { has_alpha_channel: true }
            : {}),
          ...(hyperframesOverlay ? {
            hyperframes_composition: {
              composition_id: hyperframesOverlay.composition_id,
              source_directory: hyperframesOverlay.source.project_relative_directory,
              source_fingerprint_sha256: hyperframesOverlay.source.fingerprint_sha256,
              output_sha256: hyperframesOverlay.output.sha256,
              receipt_path: `preprocess/hyperframes/${hyperframesOverlay.composition_id}.json`,
            },
          } : {}),
          ...(analysisBinding?.fingerprint_sha256
            ? { media_context_ref: { context_id: `sha256:${analysisBinding.fingerprint_sha256}`, timebase: "source_seconds" as const } }
            : {}),
          ...(customCutout ? { custom_cutout_receipt: customCutout } : {}),
          ...(bakedScratchpad ? {
            baked_sticker_outline: {
              recipe_id: bakedScratchpad.recipe_id,
              width: bakedScratchpad.outline_width,
              output_sha256: bakedScratchpad.output_sha256,
            },
          } : {}),
        };
      });

    if (visuals.some(asset => asset.preparation?.state === "preparing")) startPreparationWorker(projectId);
    const catalogStills = imageCatalog.images.map((image) => {
      const encodedFile = image.file.split(/[\\/]/).map(encodeURIComponent).join("/");
      const fileAvailable = imageCatalogFileExists(image.file);
      return {
        slot_id: `catalog:${image.id}`,
        upload_id: null,
        variation_id: null,
        beat_id: null,
        type: "still" as const,
        source_url: fileAvailable ? `/api/image-catalog/media/${encodedFile}` : null,
        duration_seconds: null,
        is_approved: true,
        is_uploaded: false,
        is_catalog: true,
        // The creator's personal library is listed with their own media, not the shared catalog.
        ...(image.personal ? { is_personal: true } : {}),
        catalog_image_id: image.id,
        file_available: fileAvailable,
        name: image.title,
        width: image.width,
        height: image.height,
        catalog_metadata: {
          description: image.description,
          colors: image.colors,
          layout: image.layout,
          source: image.source,
        },
      };
    });

    const catalogVisuals = visualCatalog.assets.map((asset) => {
      const encodedFile = asset.file.split(/[\\/]/).map(encodeURIComponent).join("/");
      const imported = asset.type === "video_clip" ? sourceManifest.assets.find(source =>
        source.storage_mode === "managed_copy" && source.source_sha256 === asset.sha256
        && source.source_path === resolveVisualCatalogFile(asset.file)
        && media.some(file => file.relPath === source.media_path)) : undefined;
      const preparation = imported ? readPreparation(projectId, imported.media_path) : null;
      const fileAvailable = Boolean(imported) || visualCatalogFileExists(asset.file);
      return {
        slot_id: `catalog:visual:${asset.id}`,
        upload_id: imported?.media_path ?? null,
        variation_id: null,
        beat_id: null,
        type: asset.type,
        source_url: imported ? importedMediaUrl(projectId, imported) : fileAvailable ? `/api/visual-catalog/media/${encodedFile}` : null,
        preparation: asset.type === "video_clip" ? preparation ?? { state: "imported" } : undefined,
        duration_seconds: preparation?.state === "ready" ? preparation.duration : asset.duration_seconds,
        is_approved: true,
        is_uploaded: false,
        is_catalog: true,
        ...(asset.personal ? { is_personal: true } : {}),
        catalog_visual_id: asset.id,
        file_available: fileAvailable,
        name: asset.title,
        width: asset.width,
        height: asset.height,
        library_annotation: { display_name: asset.title, ...asset.annotation },
        ...(asset.has_alpha_channel ? { has_alpha_channel: true } : {}),
        catalog_metadata: {
          description: asset.description,
          sha256: asset.sha256,
          source: asset.source,
        },
      };
    });

    const audio = media.filter((file) => file.kind === "audio");
    const audioPeaks = readPeaks(projectId);
    const audioNotes = new Map(audio.map(file => {
      const asset = sourceManifest.assets.find(a => a.media_path === file.relPath);
      return [file.relPath, asset ? { asset, notes: readSourceNotes(projectId, asset.asset_id) } : null] as const;
    }));
    const isSoundEffect = (file: (typeof audio)[number]) => file.isSfx || audioNotes.get(file.relPath)?.notes.kind === "sound_effect";
    const toTrack = (file: (typeof audio)[number]) => ({
      track_id: `local:${file.relPath}`,
      track_name: audioNotes.get(file.relPath)?.notes.title || file.name,
      source_asset_id: audioNotes.get(file.relPath)?.asset.asset_id,
      description: audioNotes.get(file.relPath)?.notes.description,
      import_search_text: importedSearch.get(file.relPath) ?? "",
      source_url: file.url,
      duration_seconds: file.durationSeconds ?? audioPeaks[file.url]?.source_duration_seconds,
    });

    const catalogTracks = catalog.tracks.map((track) => {
      const recommendedVersion = resolveMusicVersion(track, platform);
      const versions = track.versions.map((version) => {
        const hasLocalFile = version.file ? musicCatalogFileExists(version.file) : false;
        const encodedFile = version.file
          ? version.file.split(/[\\/]/).map(encodeURIComponent).join("/")
          : null;
        return {
          ...version,
          source_url: hasLocalFile && encodedFile
            ? `/api/music-catalog/media/${encodedFile}`
            : null,
          file_available: hasLocalFile,
        };
      });
      const resolved = versions.find((version) => version.id === recommendedVersion?.id) ?? versions[0] ?? null;
      return {
        track_id: `catalog:${track.id}`,
        track_name: track.title,
        source_url: resolved?.source_url ?? null,
        source_status: resolved?.source_status ?? "unknown",
        duration_seconds: resolved?.duration_seconds ?? null,
        catalog_track_id: track.id,
        is_catalog: true,
        ...(track.personal ? { is_personal: true } : {}),
        artist: track.artist ?? null,
        description: track.description ?? null,
        moods: track.moods,
        energy: track.energy ?? null,
        tempo_bpm: track.tempo_bpm ?? null,
        textures: track.textures,
        vocals: track.vocals,
        good_for: track.good_for,
        avoid_for: track.avoid_for,
        recommended_version_id: resolved?.id ?? null,
        delivery_target: metadata.delivery_target,
        delivery_platform: platform,
        versions,
      };
    });

    const catalogSfx = sfxCatalog.sound_effects
      .filter((effect) => sfxCatalogFileExists(effect.file))
      .map((effect) => {
        const encodedFile = effect.file.split(/[\\/]/).map(encodeURIComponent).join("/");
        return {
          track_id: `catalog:${effect.id}`,
          track_name: effect.title,
          source_url: `/api/sfx-catalog/media/${encodedFile}`,
          duration_seconds: effect.duration_seconds,
          catalog_sfx_id: effect.id,
          is_catalog: true,
          ...(effect.personal ? { is_personal: true } : {}),
          file_available: true,
          category: effect.category,
          description: effect.description ?? null,
          tags: effect.tags,
          good_for: effect.good_for,
          avoid_for: effect.avoid_for,
          source_provider: effect.source_provider,
          source_status: effect.source_status,
          analysis: effect.analysis ?? null,
          editorial: effect.editorial ?? null,
        };
      });

    const placedIntentKeys = timeline.elements
      .filter((element) => element.removed_at == null)
      .map((element) => (element.props ?? {}).intent_key)
      .filter((key): key is string => typeof key === "string");

    return compressedJson(request, pageAssets({
      beats: [],
      visuals: [...catalogStills, ...uniqueCatalogVisuals(catalogVisuals), ...visuals],
      voice_clips: [],
      music_tracks: [
        ...catalogTracks,
        ...audio.filter((file) => !isSoundEffect(file)).map(toTrack),
      ],
      sfx_tracks: [
        ...catalogSfx,
        ...audio.filter(isSoundEffect).map(toTrack),
      ],
      captions: [],
      book_visuals: [],
      book_audio_assets: [],
      hyperframes_compositions: listHyperframesCompositions(projectId),
      placed_intent_keys: placedIntentKeys,
    }, new URL(request.url).searchParams));
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load assets" },
      { status },
    );
  }
}
