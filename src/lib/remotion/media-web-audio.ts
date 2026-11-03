const SHARED_MEDIA_PROXY_PREFIX = "/api/media/";
const PROJECT_MEDIA_ROUTE = /^\/api\/projects\/[^/]+\/media\//;

/** Whether the source is eligible for Remotion's Web Audio path without CORS risk. */
export function isWebAudioApiEligibleSource(src: string | null | undefined): boolean {
  if (typeof src !== "string") return false;
  return src.startsWith(SHARED_MEDIA_PROXY_PREFIX) || PROJECT_MEDIA_ROUTE.test(src);
}

/**
 * Resolve the preview clock once for the media element's whole lifetime.
 *
 * Same-origin is only an eligibility check, never a reason by itself to use Web
 * Audio. Native media is the stable default. Web Audio is reserved for media
 * whose complete gain/envelope contract materially exceeds native unity.
 */
export function shouldUseWebAudioForMedia({
  src,
  needsAmplification,
}: {
  src: string | null | undefined;
  needsAmplification: boolean;
}): boolean {
  return needsAmplification && isWebAudioApiEligibleSource(src);
}
