/** Chat-pill kind for a Library/Storyboard selection: the asset's own type wins, else its file extension. */
export type LibrarySelectionKind = "Image" | "Video" | "Audio";
const VIDEO = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;
const AUDIO = /\.(m4a|mp3|wav|aac|flac|ogg|aif|aiff|opus)$/i;
export function libraryKindForSource(source: string, type?: "still" | "video_clip"): LibrarySelectionKind {
  if (type === "video_clip") return "Video";
  if (type === "still") return "Image";
  const path = source.split(/[?#]/)[0] ?? source;
  return AUDIO.test(path) ? "Audio" : VIDEO.test(path) ? "Video" : "Image";
}
