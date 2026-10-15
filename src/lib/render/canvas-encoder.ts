/**
 * In-page H.264 encoding of the GPU export canvas with WebCodecs. The drawn picture goes to
 * the encoder as a VideoFrame (no screenshot, no PNG); only the compressed Annex B stream
 * leaves the page, and ffmpeg copies it into the MP4 without re-encoding. Taking a lossless
 * PNG screenshot per frame was about 90% of each GPU export frame.
 */
export type CanvasEncoderConfig = {
  fps: number; firstFrame: number; bitrate: number; keyFrameSeconds: number;
  /** Encoded size when it differs from the canvas (a 720p/480p export of a 1080p canvas). */
  outputWidth?: number; outputHeight?: number;
};
export type CanvasEncoder = { encode(frame: number): Promise<void>; take(): string; finish(): Promise<string>; close(): void };

/** High profile. Level 5.1 covers 4K at 30 fps; 5.2 adds 4K at 60 fps. */
export function canvasEncoderCodec(width: number, height: number, fps: number) {
  const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
  if (macroblocks > 36_864) throw Error(`H.264 cannot encode ${width} × ${height}`);
  return macroblocks * fps > 983_040 ? "avc1.640034" : "avc1.640033";
}

function base64(chunks: Uint8Array[]): string {
  let binary = "";
  for (const chunk of chunks) for (let index = 0; index < chunk.length; index += 0x8000) binary += String.fromCharCode(...chunk.subarray(index, index + 0x8000));
  return btoa(binary);
}

export async function createCanvasEncoder(canvas: HTMLCanvasElement, config: CanvasEncoderConfig): Promise<CanvasEncoder> {
  if (typeof VideoEncoder === "undefined") throw Error("This browser cannot encode video");
  const width = config.outputWidth ?? canvas.width, height = config.outputHeight ?? canvas.height;
  // A smaller output is drawn once more at its own size, smoothed, before encoding.
  const scaled = width !== canvas.width || height !== canvas.height ? new OffscreenCanvas(width, height) : null;
  const scaledContext = scaled?.getContext("2d", { alpha: false }) ?? null;
  if (scaled && !scaledContext) throw Error("Could not prepare the smaller export size");
  if (scaledContext) scaledContext.imageSmoothingQuality = "high";
  const base = { codec: canvasEncoderCodec(width, height, config.fps), width, height, bitrate: config.bitrate, framerate: config.fps,
    latencyMode: "quality" as const, avc: { format: "annexb" as const } };
  // Hardware first (VideoToolbox on a Mac), then whatever the browser has.
  let chosen: VideoEncoderConfig | null = null;
  for (const hardwareAcceleration of ["prefer-hardware", "no-preference"] as const) {
    const candidate = { ...base, hardwareAcceleration };
    if ((await VideoEncoder.isConfigSupported(candidate)).supported) { chosen = candidate; break; }
  }
  if (!chosen) throw Error("This browser cannot encode H.264 at this size");
  let pending: Uint8Array[] = [], failure: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk) => { const bytes = new Uint8Array(chunk.byteLength); chunk.copyTo(bytes); pending.push(bytes); },
    error: (error) => { failure = error instanceof Error ? error : Error(String(error)); },
  });
  encoder.configure(chosen);
  const microseconds = (frame: number) => Math.round(frame * 1e6 / config.fps);
  const keyEvery = Math.max(1, Math.round(config.keyFrameSeconds * config.fps));
  const take = () => { if (failure) throw failure; const out = base64(pending); pending = []; return out; };
  return {
    async encode(frame) {
      if (failure) throw failure;
      // A few frames in flight keep the encoder busy without holding many canvas copies.
      while (encoder.encodeQueueSize > 4) await new Promise((resolve) => encoder.addEventListener("dequeue", resolve, { once: true }));
      if (scaledContext) scaledContext.drawImage(canvas, 0, 0, width, height);
      const picture = new VideoFrame(scaled ?? canvas, { timestamp: microseconds(frame), duration: microseconds(frame + 1) - microseconds(frame) });
      try { encoder.encode(picture, { keyFrame: (frame - config.firstFrame) % keyEvery === 0 }); } finally { picture.close(); }
    },
    take,
    async finish() { await encoder.flush(); const rest = take(); encoder.close(); return rest; },
    close() { if (encoder.state !== "closed") encoder.close(); },
  };
}
