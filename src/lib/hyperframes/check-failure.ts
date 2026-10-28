/** HyperFrames' check reports this when the page never registered its "main" timeline. */
const NO_TIMELINE = /Could not determine composition duration/;

export function isNoTimelineFailure(message: string): boolean {
  return NO_TIMELINE.test(message);
}

/**
 * Add what the page itself reported to a check failure that only says the duration is unknown:
 * the script errors it threw (from scripts/composition-object-probe.ts --errors), or that it threw
 * none and simply never set `window.__timelines.main`.
 */
export function explainNoTimelineFailure(message: string, probe: { timeline: boolean; page_errors: string[] } | null): string {
  if (!probe) return message;
  if (probe.page_errors.length) {
    const errors = [...new Set(probe.page_errors)].slice(0, 3).map((error) => `- ${error}`).join("\n");
    return `${message}\nThe page threw before its "main" timeline was registered, so no frame could be checked:\n${errors}\n`
      + "An error in looks.js comes from the look (src/lib/hyperframes/look-bundle.ts builds it); fix it there, not in the composition.";
  }
  if (!probe.timeline) {
    return `${message}\nThe page threw no error but never set window.__timelines["main"]; register the GSAP timeline as main when the page loads.`;
  }
  return message;
}

/**
 * The object check opens index.html from disk and waits 15 s for the "main" timeline. A page that
 * loads its data with fetch or XHR fails there and the wait times out with only Playwright's words;
 * say what to change.
 */
export function explainObjectProbeFailure(message: string): string {
  if (!/waitForFunction: Timeout/.test(message)) return message;
  return `${message}\nThe page did not register window.__timelines["main"] within 15 s when opened from disk. `
    + "A fetch or XHR of a local file fails there: load data and shared code with <script src> and register the timeline in index.html's inline script.";
}
