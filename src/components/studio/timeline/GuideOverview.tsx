"use client";

import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CONTRIBUTING_URL, CREATOR_PROGRAM_URL, GUIDE_TOUR_CHAPTERS, GUIDE_TOUR_EVENT, readGuideTourDone, startGuideTour,
  type GuideTourChapterId,
} from "@/lib/guide-tour";

/** Guide: the hands-on tour, chapter by chapter, on a practice project it makes the first time. */
export function GuideOverview({ templatesHref, skillsHref }: { templatesHref: string; skillsHref?: string }) {
  const [done, setDone] = useState<GuideTourChapterId[]>([]);
  const [busy, setBusy] = useState<GuideTourChapterId | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const refresh = () => setDone(readGuideTourDone());
    refresh();
    window.addEventListener(GUIDE_TOUR_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener(GUIDE_TOUR_EVENT, refresh); window.removeEventListener("focus", refresh); };
  }, []);

  const start = async (chapter: GuideTourChapterId) => {
    setBusy(chapter); setError("");
    try {
      const response = await fetch("/api/guide/practice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }) });
      const body = await response.json() as { project_id?: string; error?: string };
      if (!response.ok || !body.project_id) throw new Error(body.error ?? "Could not make the practice project. Try again.");
      startGuideTour(chapter, body.project_id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not make the practice project. Try again."); }
    finally { setBusy(null); }
  };
  const next = GUIDE_TOUR_CHAPTERS.find(chapter => !done.includes(chapter.id)) ?? GUIDE_TOUR_CHAPTERS[0];

  return <div className="guide-overview">
    <div className="guide-overview-intro">
      <h2>Learn DreamCut by using it.</h2>
      <p>Try each part on a practice project. The tour points to each control; you do the clicking.</p>
      <Button className="guide-tour-start" disabled={busy !== null} onClick={() => void start(next.id)}>
        {busy ? "Getting the practice project ready…" : done.length ? `Continue: ${next.title}` : "Start the tour"}<ArrowRight aria-hidden="true" />
      </Button>
      {error && <p role="alert" className="guide-tour-error">{error}</p>}
    </div>

    <section className="guide-overview-section" aria-labelledby="guide-tour-chapters-title">
      <h3 id="guide-tour-chapters-title">The tour</h3>
      <ol className="guide-overview-steps">
        {GUIDE_TOUR_CHAPTERS.map((chapter, index) => {
          const finished = done.includes(chapter.id);
          return <li key={chapter.id}>
            <span className="guide-step-number" data-done={finished || undefined}>{finished ? <Check size={14} aria-label="Done" /> : index + 1}</span>
            <div><strong>{chapter.title}</strong><span>{chapter.summary}</span></div>
            <Button size="sm" variant="ghost" disabled={busy !== null} aria-label={`${finished ? "Again" : "Start"}: ${chapter.title}`} onClick={() => void start(chapter.id)}>{finished ? "Again" : "Start"}</Button>
          </li>;
        })}
      </ol>
    </section>

    <section className="guide-overview-section" aria-labelledby="guide-more-title">
      <h3 id="guide-more-title">More</h3>
      <ul className="guide-overview-links">
        <li><Link href={templatesHref}>Browse templates</Link></li>
        {skillsHref && <li><Link href={skillsHref}>Editing skills</Link></li>}
        <li><a href={CONTRIBUTING_URL} target="_blank" rel="noreferrer">How to contribute a template or skill ↗</a></li>
        <li><a href={CREATOR_PROGRAM_URL} target="_blank" rel="noreferrer">Creator program ↗</a></li>
      </ul>
    </section>
  </div>;
}
