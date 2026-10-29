import { PresentedFrames } from "./presented-frames";
/** Per-player/render ownership. No global resource handles or shared decoder state. */
/** `reverse`: source time runs backward from `time`, which is the picture's source frame. */
/** `pitch` is a semitone shift that leaves timing alone (timeline/audio-pitch.ts); absent is none. */
export type AudioSample = { id: string; src: string; time: number; volume: number; rate: number; preservePitch: boolean; reverse?: boolean; pitch?: number };
export type MediaEntry = { element: HTMLMediaElement; kind: "video" | "audio"; target: number; sample: AudioSample | null; pauseWhenBuffering: boolean; active: boolean; firstFrameReady?: boolean; timelineFrame?: number; syncPreview?: () => void };
export class FrameSession {
  private decodedImages = new WeakMap<HTMLImageElement, string>();
  async decodeImage(image: HTMLImageElement) {
    const identity = () => JSON.stringify([image.src, image.currentSrc, image.srcset, image.sizes]);
    for (let attempt = 0; attempt < 4; attempt++) {
      const key = identity();
      if (image.complete && image.naturalWidth > 0 && this.decodedImages.get(image) === key) return;
      this.decodedImages.delete(image);
      try { await image.decode(); }
      catch { throw new Error(`Image failed: ${image.currentSrc || image.src}`); }
      // Do not assign an earlier decode's readiness to a replacement source.
      if (identity() !== key) continue;
      // A mounted image keeps its decoded resource. Source/responsive-candidate
      // changes and incomplete/failed loads require a new readiness check.
      if (image.complete && image.naturalWidth > 0) this.decodedImages.set(image, key);
      return;
    }
    throw new Error(`Image changed repeatedly while decoding: ${image.currentSrc || image.src}`);
  }
  readonly presentedFrames = new PresentedFrames();
  readonly resources = new Map<symbol, string>();
  readonly visualResources = new Map<symbol, string>();
  readonly media = new Map<string, MediaEntry>();
  readonly sourceDraws = new Map<string, () => void | Promise<void>>();
  readonly draws = new Map<string, () => void | Promise<void>>();
  lastSettleTiming: {resourcesMs:number;sourcesMs:number;effectsMs:number;totalMs:number}|null=null;
  error: Error | null = null;
  audioContext: AudioContext | null = null;
  externalClock: (() => number | null) | null = null;
  externalBuffering: (() => boolean) | null = null;
  previewTarget: {frame:number;epoch:number;playing:boolean} | null = null;
  previewFrameRenderer: ((frame:number,epoch:number,playing:boolean)=>void) | null = null;
  requestPreviewFrame(frame:number,epoch:number,playing:boolean) {
    this.previewTarget={frame,epoch,playing};
    this.previewFrameRenderer?.(frame,epoch,playing);
  }
  previewClock(fps: number): number | null {
    const external = this.externalClock?.();
    if (external != null && Number.isFinite(external)) return external;
    const owner = this.previewClockOwner();
    return owner?.sample ? owner.timelineFrame! + (owner.element.currentTime - owner.target) / owner.sample.rate * fps : null;
  }
  isPreviewClockOwner(element: HTMLMediaElement) {
    const external = this.externalClock?.();
    return !(external != null && Number.isFinite(external)) && this.previewClockOwner()?.element === element;
  }
  previewClockOwner() {
    return [...this.media.values()].find(entry => entry.active && entry.pauseWhenBuffering
      && entry.sample && entry.sample.volume > 0 && entry.timelineFrame != null
      && entry.element.readyState >= 3 && !entry.element.seeking && !entry.element.ended && !entry.element.paused);
  }
  fail(cause: unknown) { this.error = cause instanceof Error ? cause : new Error(String(cause)); }
  getAudioContext() { return this.audioContext ??= new AudioContext(); }
  dispose() { for (const entry of this.media.values()) entry.element.pause(); void this.audioContext?.close(); this.externalClock = null; this.externalBuffering = null; this.previewFrameRenderer = null; this.previewTarget = null; this.resources.clear(); this.visualResources.clear(); this.media.clear(); this.draws.clear(); this.sourceDraws.clear(); this.presentedFrames.clear(); this.decodedImages = new WeakMap(); }
  buffering() {
    return this.visualResources.size > 0 || this.mediaBuffering();
  }
  /** Only a picture is still being prepared; every audible and decoding source is ready. */
  pictureOnlyBuffering() {
    return this.visualResources.size > 0 && !this.mediaBuffering();
  }
  private mediaBuffering() {
    return Boolean(this.externalBuffering?.())
      || [...this.media.values()].some(({element, kind, active, firstFrameReady, pauseWhenBuffering}) => active && !element.ended
        && ((kind === "video" && firstFrameReady === false)
          || (pauseWhenBuffering && (element.readyState < 3 || element.seeking))));
  }
}
const mediaLabel = (url: string) => url.startsWith("data:") ? url.slice(0, url.indexOf(",")) + ",[embedded media]" : url.slice(0, 240);
const nextPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
function waitEvent(element: HTMLMediaElement, name: string, timeout: number) {
  return new Promise<void>((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error(`Media failed: ${mediaLabel(element.currentSrc)}`)); };
    const poll = setInterval(() => { if (!element.isConnected || (name === "loadeddata" && element.readyState >= 2)) done(); }, 16);
    const timer = setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for ${name}: ${mediaLabel(element.currentSrc)}`)); }, timeout);
    const cleanup = () => { clearInterval(poll); clearTimeout(timer); element.removeEventListener(name, done); element.removeEventListener("error", fail); };
    element.addEventListener(name, done, { once: true }); element.addEventListener("error", fail, { once: true });
  });
}
async function seekPresentedFrame(entry: MediaEntry) {
  const video = entry.element as HTMLVideoElement;
  if (video.error) throw new Error(`Video failed: ${mediaLabel(video.currentSrc)}: ${video.error.message}`);
  if (video.readyState < 2) await waitEvent(video, "loadeddata", 30_000);
  if (!video.isConnected) return;
  // The native decoder owns source timestamps (including VFR). Request the exact source
  // time, then wait for decode completion and compositor paints.
  const target = Math.max(0, Math.min(entry.target, Math.max(0, video.duration - .00001)));
  const seekTarget = Math.min(video.duration - .00001, target + .000001);
  if (Math.abs(video.currentTime - seekTarget) < .000002 && !video.seeking) return;
  await new Promise<void>((resolve, reject) => {
    // seeked means the target playback position has decoded data. A queued
    // requestVideoFrameCallback may still describe the old frame, so do not use
    // it as acknowledgement. Paint after seek completion before reading pixels.
    const timeout = setTimeout(() => finish(new Error(`Video did not seek to ${target} (actual ${video.currentTime}, seeking ${video.seeking}): ${mediaLabel(video.currentSrc)}`)), 30_000);
    const finish = (error?: Error) => {
      clearTimeout(timeout); video.removeEventListener("seeked", onSeek); video.removeEventListener("error", onError);
      error ? reject(error) : resolve();
    };
    const onSeek = () => { if (!video.seeking && Math.abs(video.currentTime - target) < .001) finish(); };
    const onError = () => finish(new Error(`Video seek failed: ${mediaLabel(video.currentSrc)}`));
    video.addEventListener("seeked", onSeek); video.addEventListener("error", onError);
    // Chromium truncates requested seconds to microseconds. At exact frame
    // boundaries this can land on the preceding frame (e.g. 89 / 30).
    video.currentTime = seekTarget;
  });
  await nextPaint();
  await nextPaint();
}
/** Finish source/effect work for a hidden stage; its owner publishes on the next paint. */
export async function settleFrameResources(session: FrameSession, root: HTMLElement): Promise<AudioSample[]> {
  const began=performance.now(),deadline = began + 30_000;
  for (;;) {
    if (session.error) throw session.error;
    await Promise.all([...root.querySelectorAll("img")].map(image => session.decodeImage(image)));
    await Promise.all([...session.media.values()].filter(x => x.kind === "video").map(seekPresentedFrame));
    await document.fonts.ready;
    await nextPaint();
    if (!session.resources.size) break;
    if (performance.now() > deadline) throw new Error(`Unresolved frame resources: ${[...session.resources.values()].join(", ")}`);
  }
  // Effects render after source video decoding, never from a previous surface.
  const resourcesDone=performance.now();
  for (const draw of session.sourceDraws.values()) await draw();
  const sourcesDone=performance.now();
  for (const draw of session.draws.values()) await draw();
  const done=performance.now();
  session.lastSettleTiming={resourcesMs:resourcesDone-began,sourcesMs:sourcesDone-resourcesDone,effectsMs:done-sourcesDone,totalMs:done-began};
  if (session.error) throw session.error;
  return [...session.media.values()].flatMap(x => x.sample ? [x.sample] : []);
}

/** Captures additionally wait for the browser to paint the completed scene. */
export async function settleFrame(session: FrameSession, root: HTMLElement): Promise<AudioSample[]> {
  const samples = await settleFrameResources(session, root);
  await nextPaint();
  if (session.error) throw session.error;
  return samples;
}

/** A user Play gesture can recover denied autoplay; decode/resource failures remain fatal. */
export function retryPlaybackPermission(session: Pick<FrameSession, 'error'>) {
  if (session.error?.name !== 'NotAllowedError') return false;
  session.error = null;
  return true;
}
