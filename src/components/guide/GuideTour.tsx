"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Keycap } from "@/components/ui/keycap";
import {
  GUIDE_TOUR_CHAPTERS, GUIDE_TOUR_DONE_KEY, GUIDE_TOUR_EVENT, GUIDE_TOUR_STATE_KEY, readGuideTourDone,
  type GuideTourChapterId,
} from "@/lib/guide-tour";
import { TOUR_STEPS, type TourAction, type TourContext } from "./guide-tour-steps";

type TourState = { chapter: GuideTourChapterId; step: number; projectId: string };
type Rect = { top: number; left: number; width: number; height: number };

function readState(): TourState | null {
  try {
    const state = JSON.parse(localStorage.getItem(GUIDE_TOUR_STATE_KEY) ?? "null") as TourState | null;
    return state && TOUR_STEPS[state.chapter] ? state : null;
  } catch { return null; }
}
function saveState(state: TourState | null) {
  try { if (state) localStorage.setItem(GUIDE_TOUR_STATE_KEY, JSON.stringify(state)); else localStorage.removeItem(GUIDE_TOUR_STATE_KEY); } catch { /* per-viewer convenience */ }
}
function markChapterDone(chapter: GuideTourChapterId) {
  try { localStorage.setItem(GUIDE_TOUR_DONE_KEY, JSON.stringify([...new Set([...readGuideTourDone(), chapter])])); } catch { /* per-viewer convenience */ }
}

/**
 * The Guide's tour, over every page: it outlines the control a step is about and checks what the
 * creator did. It only points: every click and key is the creator's own, and it never applies,
 * rejects or shares anything. Its place is kept in this browser, so it follows across pages.
 */
export function GuideTour() {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<TourState | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const memo = useRef<Record<string, unknown>>({});
  const remote = useRef<{ cards: TourContext["cards"]; selection: TourContext["selection"] }>({ cards: null, selection: null });

  const go = useCallback((next: TourState | null) => {
    memo.current = {}; setDone(false); setError(""); setProgress(undefined);
    saveState(next); setState(next);
  }, []);

  useEffect(() => {
    setState(readState());
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ start?: TourState }>).detail;
      if (detail?.start) go(detail.start);
    };
    window.addEventListener(GUIDE_TOUR_EVENT, onEvent);
    return () => window.removeEventListener(GUIDE_TOUR_EVENT, onEvent);
  }, [go]);

  const steps = state ? TOUR_STEPS[state.chapter] : [];
  const step = state ? steps[state.step] : undefined;
  const chapterIndex = state ? GUIDE_TOUR_CHAPTERS.findIndex(chapter => chapter.id === state.chapter) : -1;
  const finished = Boolean(state && !step);

  // What the page cannot show: the practice card's review state, and what the creator selected for the agent.
  useEffect(() => {
    if (!state || finished || (state.chapter !== "cards" && state.chapter !== "effects")) return;
    const controller = new AbortController();
    const project = `/api/projects/${encodeURIComponent(state.projectId)}`;
    const read = async () => {
      try {
        if (state.chapter === "cards") {
          const response = await fetch(`${project}/timeline/proposals`, { cache: "no-store", signal: controller.signal });
          const body = await response.json() as { proposals?: { status: "pending" | "approved" | "rejected" }[] };
          remote.current.cards = (body.proposals ?? []).map(card => card.status);
        } else {
          const response = await fetch(`${project}/library-selection`, { cache: "no-store", signal: controller.signal });
          const body = await response.json() as { items?: { group: string; label: string }[] };
          remote.current.selection = body.items ?? [];
        }
      } catch { /* the next read tries again */ }
    };
    void read();
    const timer = window.setInterval(read, 2000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [state, finished]);

  // Follow the target and check the step a few times a second; a finished step moves on by itself.
  useEffect(() => {
    if (!state || !step) { setRect(null); return; }
    let advanceTimer: number | undefined;
    let timer: number | undefined;
    const scrolledTo = new WeakSet<Element>();
    const tick = () => {
      const context: TourContext = {
        path: window.location.pathname, search: new URLSearchParams(window.location.search), projectId: state.projectId,
        memo: memo.current, ...remote.current,
      };
      if (step.skip?.(context)) { window.clearInterval(timer); go({ ...state, step: state.step + 1 }); return; }
      const target = step.target?.();
      // A control below the fold of its panel is scrolled into view once, so the outline is never on something else.
      if (target && !scrolledTo.has(target)) { scrolledTo.add(target); target.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
      const box = target?.getBoundingClientRect();
      const next = box && box.width > 0 ? { top: box.top, left: box.left, width: box.width, height: box.height } : null;
      // Only a moved or resized target redraws the outline.
      setRect(current => current && next && current.top === next.top && current.left === next.left
        && current.width === next.width && current.height === next.height ? current : next);
      setProgress(step.progress?.(context));
      if (step.done?.(context) && advanceTimer === undefined) {
        setDone(true);
        advanceTimer = window.setTimeout(() => go({ ...state, step: state.step + 1 }), 900);
      }
    };
    timer = window.setInterval(tick, 300);
    tick();
    return () => { window.clearInterval(timer); window.clearTimeout(advanceTimer); };
  }, [state, step, go, pathname]);

  useEffect(() => { if (state && finished) markChapterDone(state.chapter); }, [state, finished]);

  if (!state) return null;

  // The one shortcut: open (and if need be make) the practice project.
  const run = async (_kind: TourAction) => {
    setError(""); setBusy(true);
    try {
      const response = await fetch("/api/guide/practice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }) });
      const body = await response.json() as { project_id?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Something went wrong. Try again.");
      router.push(`/p/${encodeURIComponent(body.project_id ?? state.projectId)}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Something went wrong. Try again."); }
    finally { setBusy(false); }
  };

  const nextChapter = GUIDE_TOUR_CHAPTERS[chapterIndex + 1];
  // The card sits away from what it points at: the other side, and above it when the target is low.
  // A target across most of the page (the timeline) keeps it right, over the picture's corner.
  const side = rect && rect.width < window.innerWidth / 2 && rect.left + rect.width / 2 > window.innerWidth / 2 ? "left" : "right";
  const low = rect && rect.top + rect.height / 2 > window.innerHeight * 0.55;
  const cardStyle: CSSProperties = { [side]: 16, ...(low ? { top: 64 } : { bottom: 16 }) };
  const pad = 6;

  return <>
    {rect && <div className="guide-tour-spotlight" aria-hidden="true"
      style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />}
    <section className="guide-tour-card" style={cardStyle} role="dialog" aria-modal="false" aria-labelledby="guide-tour-title" aria-live="polite">
      <header className="guide-tour-header">
        <span className="guide-tour-chapter">{GUIDE_TOUR_CHAPTERS[chapterIndex]?.title}{step ? ` · Step ${state.step + 1} of ${steps.length}` : ""}</span>
        <Button variant="ghost" size="icon-sm" aria-label="End tour" title="End tour" onClick={() => go(null)}><X aria-hidden="true" /></Button>
      </header>
      {step ? <>
        <h2 id="guide-tour-title" className="guide-tour-title">{done && <Check aria-hidden="true" />}{step.title}</h2>
        {step.body && <p className="guide-tour-body">{step.body}</p>}
        {step.keys && <p className="guide-tour-keys">{step.keys.map(key => <Keycap key={key}>{key}</Keycap>)}</p>}
        {progress && <p className="guide-tour-progress" role="status">{progress}</p>}
        {step.link && <a className="guide-tour-link" href={step.link.href} target="_blank" rel="noreferrer">{step.link.label} ↗</a>}
        {error && <p role="alert" className="guide-tour-error">{error}</p>}
        <footer className="guide-tour-actions">
          {step.action && <Button size="sm" variant={step.done && !step.target ? "default" : "outline"} disabled={busy} onClick={() => void run(step.action!.kind)}>{step.action.label}</Button>}
          {!step.action && <span aria-hidden="true" />}
          {state.step > 0 && <Button size="sm" variant="ghost" onClick={() => go({ ...state, step: state.step - 1 })}>Back</Button>}
          <Button size="sm" variant={step.done ? "ghost" : "default"} onClick={() => go({ ...state, step: state.step + 1 })}>{step.done ? "Skip" : "Next"}</Button>
        </footer>
      </> : <>
        <h2 id="guide-tour-title" className="guide-tour-title"><Check aria-hidden="true" />{GUIDE_TOUR_CHAPTERS[chapterIndex]?.title} done</h2>
        <footer className="guide-tour-actions">
          <Button size="sm" variant="ghost" onClick={() => { go(null); router.push(`/?view=guide&project=${encodeURIComponent(state.projectId)}`); }}>Back to Guide</Button>
          {nextChapter ? <Button size="sm" onClick={() => go({ chapter: nextChapter.id, step: 0, projectId: state.projectId })}>Next: {nextChapter.title}</Button>
            : <Button size="sm" onClick={() => go(null)}>Finish</Button>}
        </footer>
      </>}
    </section>
  </>;
}
