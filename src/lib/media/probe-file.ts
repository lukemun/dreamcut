export type ProbedMedia = {
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
};

export async function probeMediaFile(file: File): Promise<ProbedMedia> {
  const mime = file.type.toLowerCase();
  if (mime.startsWith("image/")) return probeImage(file);
  if (mime.startsWith("video/")) return probeVideo(file);
  if (mime.startsWith("audio/")) return probeAudio(file);
  return { width: null, height: null, durationSeconds: null };
}

function probeImage(file: File): Promise<ProbedMedia> {
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve) => {
    const image = new window.Image();
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    image.onload = () => {
      const width = image.naturalWidth > 0 ? image.naturalWidth : null;
      const height = image.naturalHeight > 0 ? image.naturalHeight : null;
      cleanup();
      resolve({ width, height, durationSeconds: null });
    };
    image.onerror = () => {
      cleanup();
      resolve({ width: null, height: null, durationSeconds: null });
    };
    image.src = objectUrl;
  });
}

function probeVideo(file: File): Promise<ProbedMedia> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  return new Promise((resolve) => {
    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    };
    video.onloadedmetadata = () => {
      const width = video.videoWidth > 0 ? video.videoWidth : null;
      const height = video.videoHeight > 0 ? video.videoHeight : null;
      const durationSeconds = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
      cleanup();
      resolve({ width, height, durationSeconds });
    };
    video.onerror = () => {
      cleanup();
      resolve({ width: null, height: null, durationSeconds: null });
    };
    video.src = objectUrl;
  });
}

function probeAudio(file: File): Promise<ProbedMedia> {
  const objectUrl = URL.createObjectURL(file);
  const audio = document.createElement("audio");
  audio.preload = "metadata";
  return new Promise((resolve) => {
    const cleanup = () => {
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(objectUrl);
    };
    audio.onloadedmetadata = () => {
      const durationSeconds = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
      cleanup();
      resolve({ width: null, height: null, durationSeconds });
    };
    audio.onerror = () => {
      cleanup();
      resolve({ width: null, height: null, durationSeconds: null });
    };
    audio.src = objectUrl;
  });
}
