"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { liveMotionStore } from "./live-motion-store";
import { UpdatingStatus } from "./UpdatingStatus";

/** Rebuilding the scene on every drag sample would only queue loads; draw the newest after a pause. */
const DRAFT_SETTLE_MS = 150;

type Frame = { id: number; src: string; html: string; ready: boolean };

/**
 * Draws a motion graphic's unrendered dial values over its clip, straight from the composition,
 * so a dial change shows at once. The real render replaces it when it lands. Each new draft loads
 * behind the current one and swaps in only once it has drawn, so the picture never goes blank.
 */
export function LiveMotionOverlay({ projectId, playheadSec }: { projectId: string; playheadSec: number }) {
  const draft = useSyncExternalStore(liveMotionStore.subscribe, liveMotionStore.get, () => null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const refs = useRef(new Map<number, HTMLIFrameElement>());
  const nextId = useRef(0);
  const offset = useRef(0);

  const inside = draft != null && playheadSec >= draft.window.start && playheadSec < draft.window.start + draft.window.duration;
  // Off the clip the draft waits at its nearest end, loaded, so a replay shows it from the clip's first frame.
  const time = draft ? Math.min(Math.max(playheadSec - draft.window.start, 0), draft.window.duration) + draft.window.sourceStart : 0;
  offset.current = time;

  const src = draft
    ? `/api/projects/${encodeURIComponent(projectId)}/hyperframes/live/${encodeURIComponent(draft.compositionId)}/index.html?values=${encodeURIComponent(JSON.stringify(draft.values))}`
    : null;

  useEffect(() => {
    if (!src) {
      setFrames([]);
      return;
    }
    const abort = new AbortController();
    // A sandboxed frame cannot load a page by address here, so it gets the page's text instead.
    const timer = window.setTimeout(() => {
      void fetch(src, { signal: abort.signal }).then((response) => response.ok ? response.text() : null).then((html) => {
        if (html == null) return;
        setFrames((current) => current.some((frame) => frame.src === src) ? current : [...current.filter((frame) => frame.ready).slice(-1), { id: nextId.current++, src, html, ready: false }]);
      }).catch(() => undefined);
    }, DRAFT_SETTLE_MS);
    return () => { window.clearTimeout(timer); abort.abort(); };
  }, [src]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const type = (event.data as { type?: string } | null)?.type;
      if (type !== "dreamcut-live-ready" && type !== "dreamcut-live-failed") return;
      const id = [...refs.current].find(([, element]) => element.contentWindow === event.source)?.[0];
      if (id === undefined) return;
      if (type === "dreamcut-live-failed") {
        // Nothing drew: drop it and any older draft, so the rendered clip shows and is named as such.
        setFrames((current) => current.filter((frame) => frame.id > id));
        return;
      }
      refs.current.get(id)?.contentWindow?.postMessage({ type: "dreamcut-live-seek", t: offset.current }, "*");
      // Show it a frame later, once the seeked picture is drawn, and drop the one it replaces.
      requestAnimationFrame(() => setFrames((current) => current.flatMap((frame) => frame.id === id ? [{ ...frame, ready: true }] : frame.id > id ? [frame] : [])));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    for (const element of refs.current.values()) element.contentWindow?.postMessage({ type: "dreamcut-live-seek", t: time }, "*");
  }, [time, frames]);

  const drawing = inside && frames.some((frame) => frame.ready);
  const status = draft?.rendering
    ? <UpdatingStatus className="absolute left-3 top-3 z-[1] bg-[var(--popover)] shadow-sm">{!inside ? "Updating" : drawing ? "Updating · showing a preview" : "Updating · showing the previous version"}</UpdatingStatus>
    : null;
  if (!frames.length) return status ? <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{status}</div> : null;
  return (
    <div data-live-motion style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {status}
      {frames.map((frame) => (
        <iframe
          key={frame.id}
          ref={(element) => { if (element) refs.current.set(frame.id, element); else refs.current.delete(frame.id); }}
          srcDoc={frame.html}
          title="Live preview"
          aria-hidden
          sandbox="allow-scripts"
          tabIndex={-1}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, background: "transparent", colorScheme: "normal", visibility: frame.ready && inside ? "visible" : "hidden" }}
        />
      ))}
    </div>
  );
}
