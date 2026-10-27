import { parsePreviewQuality } from "../preview-quality";

export const PREVIEW_PROXY_CONTRACT = "preview-proxy-v1";

export function proxyDimensionsAllowed(width: number, height: number, alpha: boolean, quality?: unknown): boolean {
  const tier = parsePreviewQuality(quality);
  const edge = alpha ? 960 : tier === "uhd" ? 3840 : tier === "hd" ? 1920 : 1280;
  const short = alpha ? 540 : tier === "uhd" ? 2160 : tier === "hd" ? 1080 : 720;
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    && Math.max(width, height) <= edge && Math.min(width, height) <= short;
}

export function hasValidatedPreviewProxy(props: Record<string, unknown> | null | undefined): boolean {
  const proof = props?.preview_proxy_validation as Record<string, unknown> | undefined;
  return proof?.contract === PREVIEW_PROXY_CONTRACT && proof.url === (props?.runtime_preview_source_url ?? props?.preview_source_url)
    && proof.ok === true
    && proxyDimensionsAllowed(Number(proof.width), Number(proof.height), props?.has_alpha === true, proof.quality);
}
