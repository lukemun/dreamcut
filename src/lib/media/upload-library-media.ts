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
  if (/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) return "still";
  if (/\.(mp4|mov|webm)$/i.test(file.name)) return "video_clip";
  if (/\.(mp3|wav|m4a)$/i.test(file.name)) return audio;
  return null;
}

export const UPLOAD_FILENAME_HEADER = "x-dreamcut-filename";
export const UPLOAD_ASSET_TYPE_HEADER = "x-dreamcut-asset-type";

/** The uploaded-assets request for one file: the file itself is the body, so the server streams it to disk and
 *  videos of any size never pass through FormData or memory. */
export function uploadAssetRequest(file: File, assetType: UploadAssetType): { headers: Record<string, string>; body: File } {
  return {
    headers: {
      "content-type": file.type || "application/octet-stream",
      [UPLOAD_FILENAME_HEADER]: encodeURIComponent(file.name),
      [UPLOAD_ASSET_TYPE_HEADER]: assetType,
    },
    body: file,
  };
}

export type UploadedLibraryMedia = {
  assetType: UploadAssetType;
  sourceUrl: string;
  filename: string;
  processing?: { status: string; error?: string };
};

/** Managed import into the project Library: bytes are copied, hashed and queued for preparation. */
export async function uploadLibraryMedia(projectId: string, file: File, audio: "music" | "sfx" = "music", onProgress?: (percent: number) => void): Promise<UploadedLibraryMedia> {
  const assetType = deriveUploadAssetType(file, audio);
  if (!assetType) throw new Error("Unsupported file type. Upload an image, video, or audio file.");
  const upload = uploadAssetRequest(file, assetType);
  // The server probes the managed copy in its background worker. Browser
  // metadata events can hang on unsupported codecs and are not authoritative.
  const body = await new Promise<{ processing?: { status: string; error?: string }; asset: { source_url: string } }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `/api/projects/${projectId}/uploaded-assets`);
    request.responseType = "json";
    for (const [name, value] of Object.entries(upload.headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress?.(Math.round(event.loaded / event.total * 100)); };
    request.onerror = () => reject(new Error("Import interrupted. Check your connection and try again."));
    request.onabort = () => reject(new Error("Import cancelled."));
    request.onload = () => {
      const result = request.response;
      if (request.status < 200 || request.status >= 300 || !result?.asset?.source_url) reject(new Error(result?.error ?? "Import failed"));
      else resolve(result);
    };
    request.send(upload.body);
  });
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LIBRARY_CHANGED_EVENT));
  return { assetType, sourceUrl: body.asset.source_url, filename: file.name, processing: body.processing };
}
