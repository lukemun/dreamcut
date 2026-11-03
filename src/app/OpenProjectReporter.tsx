"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

// Coding agents read which project the creator is looking at (editor_context_get), so a
// request such as "Use this template with my footage" needs no project name.
const REPEAT_MS = 15_000;
const HEARTBEAT_MS = 5 * 60_000;
// One id per page load, not per sessionStorage: a duplicated tab clones sessionStorage and
// would overwrite the original's entry. Reloads clear the old id on pagehide.
let pageWindowId: string | null = null;
const editorWindowId = () => pageWindowId ??= (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, "").slice(0, 32);

export function OpenProjectReporter() {
  const pathname = usePathname();
  const embedded = useSearchParams().get("embed") === "1";
  useEffect(() => {
    if (embedded) return;
    const windowId = editorWindowId();
    let last = 0;
    // Only a page the creator can see counts; a tab loaded in the background waits until shown.
    const report = (force: boolean, leaving = false) => {
      if (!leaving && document.visibilityState !== "visible") return;
      if (!force && Date.now() - last < REPEAT_MS) return;
      last = Date.now();
      void fetch("/api/editor-context", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ window_id: windowId, pathname, visible: !leaving }), keepalive: true })
        .then(response => response.body?.cancel()).catch(() => {});
    };
    report(true);
    // Leaving the page records the moment the creator last saw it (visible: false); returning records again.
    // Forced both ways: a quick hide-and-return must not leave the window recorded as hidden.
    const onVisibility = () => document.visibilityState === "hidden" ? report(true, true) : report(true);
    const onFocus = () => report(false);
    const onPageHide = () => { navigator.sendBeacon?.("/api/editor-context", JSON.stringify({ window_id: windowId, pathname: null })); };
    const heartbeat = window.setInterval(() => report(true), HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [embedded, pathname]);
  return null;
}
