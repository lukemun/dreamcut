// Cross-browser capability helpers.
//
// Centralises the small amount of browser-quirk handling we need so new
// call sites don't each re-learn where Safari and Firefox differ.
// Context: docs/plans/2026-04-21-browser-compat-audit.md

/**
 * Largest safe canvas dimension (width or height) for the current browser.
 *
 * iOS Safari enforces a per-canvas ~4096² memory cap — above it, `toDataURL`
 * silently returns `"data:,"` instead of a real PNG. Chrome and Desktop
 * Safari are more generous (~16384). We fall back to 16384 on non-iOS
 * browsers since html-to-image's own cap is 16384.
 */
export function getMaxCanvasDimension(): number {
  if (typeof navigator === "undefined") return 16384;
  // iOS Safari (incl. iPad/iPhone/iPod, Chrome on iOS which also uses WebKit)
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return 4096;
  return 16384;
}

/**
 * Return a pixel ratio that keeps the final canvas within the browser's
 * limit. Returns the caller's desired ratio when it's already safe.
 */
export function clampPixelRatioToCanvasLimit(
  width: number,
  height: number,
  desiredRatio: number,
): { ratio: number; clamped: boolean } {
  const max = getMaxCanvasDimension();
  const longEdge = Math.max(width, height);
  if (longEdge <= 0 || desiredRatio <= 0) return { ratio: desiredRatio, clamped: false };
  const maxRatio = max / longEdge;
  if (desiredRatio <= maxRatio) return { ratio: desiredRatio, clamped: false };
  return { ratio: Math.max(0.1, maxRatio), clamped: true };
}

/**
 * Best-effort copy text to clipboard. Prefers `navigator.clipboard.writeText`
 * (HTTPS + user gesture required) and falls back to a hidden textarea +
 * `document.execCommand("copy")` for non-secure contexts, Safari private
 * browsing, and legacy browsers.
 *
 * Resolves `true` on success, `false` if both paths failed. Never throws so
 * UI handlers can treat it as a simple boolean.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy path.
    }
  }
  if (typeof document === "undefined") return false;
  return copyViaTextareaFallback(text);
}

function copyViaTextareaFallback(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  // Off-screen but still focusable — required for execCommand to work.
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.left = "-1000px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

/**
 * Ensure an `AudioContext` is in the running state. Safari's autoplay policy
 * puts new contexts in `suspended` until resumed via a user gesture; in that
 * state, some operations (older iOS: `decodeAudioData`) silently reject.
 *
 * Call this before any decode/play. Safe to call on already-running contexts.
 */
export async function ensureAudioContextRunning(ctx: AudioContext): Promise<void> {
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      // resume() can reject without a user gesture on Safari — callers can
      // still proceed; the failure mode is an audible silence, not a crash.
    }
  }
}
