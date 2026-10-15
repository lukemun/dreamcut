import { probeMediaFile } from "@/lib/media/probe-file";

/** Library media an editor upload can become; audio is music unless the caller says it is a sound effect. */
export type UploadAssetType = "still" | "video_clip" | "music" | "sfx";

export const APPROVED_UPLOAD_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif," +
  "video/mp4,video/quicktime,video/webm," +
  "audio/mpeg,audio/wav,audio/x-m4a,audio/mp4";

/** Any editor surface that imports media announces it so open Library views refresh. */
export const LIBRARY_CHANGED_EVENT = "dreamcut:library-changed";

export function deriveUploadAssetType(file: File, audio: "music" | "sfx" = "music"): UploadAssetType | null {
  const mime = file.type.toLowerCase();
  if (mime.startsWith("image/")) return "still";
  if (mime.startsWith("video/")) return "video_clip";
  if (mime.startsWith("audio/")) return audio;
  if (/\.(heic|heif)$/i.test(file.name)) return "still";
  return null;
}

export type UploadedLibraryMedia = {
  assetType: UploadAssetType;
  sourceUrl: string;
  filename: string;
  processing?: { status: string; error?: string };
};

/** Managed import into the project Library: bytes are copied, hashed and queued for preparation. */
export async function uploadLibraryMedia(projectId: string, file: File, audio: "music" | "sfx" = "music"): Promise<UploadedLibraryMedia> {
  const assetType = deriveUploadAssetType(file, audio);
  if (!assetType) throw new Error("Unsupported file type. Upload an image, video, or audio file.");
  const probed = await probeMediaFile(file);
  const formData = new FormData();
  formData.set("file", file);
  formData.set("asset_type", assetType);
  if (probed.durationSeconds != null) formData.set("duration_seconds", String(Number(probed.durationSeconds.toFixed(3))));
  if (probed.width != null) formData.set("width", String(probed.width));
  if (probed.height != null) formData.set("height", String(probed.height));
  const response = await fetch(`/api/projects/${projectId}/uploaded-assets`, { method: "POST", body: formData });
  const body = await response.json().catch(() => ({})) as { error?: string; processing?: { status: string; error?: string }; asset?: { source_url?: string } };
  if (!response.ok || !body.asset?.source_url) throw new Error(typeof body.error === "string" ? body.error : "Upload failed");
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LIBRARY_CHANGED_EVENT));
  return { assetType, sourceUrl: body.asset.source_url, filename: file.name, processing: body.processing };
}
