"use client";

import { useSyncExternalStore } from "react";

/**
 * Below this window width the editor shares the screen (e.g. half a display beside Claude Code
 * or Codex). Tall's three columns no longer fit, so the workspace uses Wide whatever the shape.
 */
export const HALF_SCREEN_MAX_WIDTH = 1100;
const QUERY = `(max-width: ${HALF_SCREEN_MAX_WIDTH}px)`;

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function useHalfScreenWorkspace(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
