"use client";

import Link from "next/link";
import type { MemoryPage } from "@/lib/local-store/editing-memory";
import styles from "./ProjectHistory.module.css";

type HistoryView = Extract<MemoryPage, { section: "history" }>;
type Chapter = HistoryView["chapters"][number];
type Card = { id: string; summary: string; status: string };
type Entry =
  | { kind: "request"; id: string; time: string; who: string; text: string; cards: Card[] }
  | { kind: "changes"; id: string; time: string; actor: string; steps: Chapter[] };

/** Card outcomes in the words the review panel uses. */
export const cardStatusLabel = (status: string) => ({
  pending: "Waiting", approved: "Applied", applied: "Applied", rejected: "Turned down", superseded: "Replaced",
} as Record<string, string>)[status] ?? status;
const actorLabel = (actor: string) => actor === "human" ? "You" : actor === "agent" ? "Agent" : "DreamCut";
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const timeOfDay = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function dayLabel(iso: string) {
  const day = new Date(iso); day.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return day.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: day.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

const REVIEW_SESSION = "proposal-review";
const DEFAULT_REJECT_NOTE = "Rejected in the editor";
const SHOWN_CARDS = 4;

// Steps by the same person within a few minutes read as one burst of work.
const GROUP_GAP_MS = 10 * 60_000;

/** Newest first: what was asked, and the changes that followed. */
export function historyEntries(view: Pick<HistoryView, "feedback" | "chapters" | "chapter_page" | "proposals">): Entry[] {
  const oldestLoaded = view.chapter_page.next_cursor ? view.chapters.at(-1)?.time : undefined;
  const requests: Entry[] = view.feedback.directions
    .filter(item => !item.superseded_by.length && (!oldestLoaded || item.time >= oldestLoaded))
    .flatMap((item): Entry[] => {
      // Turning a card down in the editor records a note against that card; show the card, and any reason typed with it.
      const rejected = item.session_id === REVIEW_SESSION ? view.proposals.find(card => item.targets?.proposal_ids?.includes(card.proposal_id)) : undefined;
      // A card already listed under the request it answers shows its outcome there; only a typed reason adds anything.
      const listed = rejected && view.feedback.directions.some(other => other.proposals.some(card => card.id === rejected.proposal_id));
      if (item.session_id === REVIEW_SESSION && (!rejected || (listed && item.direction === DEFAULT_REJECT_NOTE))) return [];
      if (rejected) return [{ kind: "request", id: item.id, time: item.time, who: "You turned down a card",
        text: item.direction === DEFAULT_REJECT_NOTE ? "" : item.direction,
        cards: [{ id: rejected.proposal_id, summary: rejected.proposal.summary, status: "rejected" }] }];
      return [{ kind: "request", id: item.id, time: item.time, who: "You asked", text: item.direction,
        cards: item.proposals.filter(card => card.status !== "superseded") }];
    });
  const changes: Entry[] = [];
  for (const chapter of view.chapters) {
    const actor = chapter.actor ?? "unknown";
    const last = changes.at(-1);
    if (last?.kind === "changes" && last.actor === actor
      && new Date(last.steps.at(-1)!.time).getTime() - new Date(chapter.time).getTime() <= GROUP_GAP_MS) last.steps.push(chapter);
    else changes.push({ kind: "changes", id: chapter.id, time: chapter.time, actor, steps: [chapter] });
  }
  return [...requests, ...changes].sort((a, b) => b.time.localeCompare(a.time));
}

function CardList({ cards }: { cards: Card[] }) {
  return <ul className={styles.cards}>{cards.map(card => <li key={card.id}>
    <span className={`memory-status ${styles.status}`} data-status={card.status}>{cardStatusLabel(card.status)}</span><span>{card.summary}</span>
  </li>)}</ul>;
}

export function ProjectHistory({ projectId, view, onShowEarlier }: {
  projectId: string; view: HistoryView; onShowEarlier: () => void;
}) {
  const entries = historyEntries(view);
  const days: { label: string; entries: Entry[] }[] = [];
  for (const entry of entries) {
    const label = dayLabel(entry.time);
    if (days.at(-1)?.label === label) days.at(-1)!.entries.push(entry); else days.push({ label, entries: [entry] });
  }
  const waiting = view.proposals.filter(proposal => proposal.status === "pending").length;

  return <div className={`memory-page-column ${styles.history}`}>
    {waiting > 0 && <div className={styles.waiting} role="status">
      <span className={styles.waitingDot} aria-hidden="true" />
      <p>{waiting} {waiting === 1 ? "card is" : "cards are"} waiting for your review</p>
      <Link className={styles.action} href={`/p/${projectId}`}>Review in editor</Link>
    </div>}

    {!entries.length && <p className={styles.empty}>No changes yet</p>}
    {days.map(day => <section key={day.label} className={styles.day} aria-label={day.label}>
      <h2 className={styles.dayTitle}>{day.label}</h2>
      <ol className={styles.feed}>
        {day.entries.map(entry => <li key={entry.id} className={styles.entry} data-kind={entry.kind} data-actor={entry.kind === "changes" ? entry.actor : undefined}>
          <time className={styles.time} dateTime={entry.time}>{timeOfDay(entry.time)}</time>
          <span className={styles.dot} aria-hidden="true" />
          <div className={styles.body}>
            {entry.kind === "request" ? <>
              <p className={styles.who}>{entry.who}</p>
              {entry.text && <p className={styles.request}>{entry.text}</p>}
              {!!entry.cards.length && <CardList cards={entry.cards.slice(0, SHOWN_CARDS)} />}
              {entry.cards.length > SHOWN_CARDS && <details className={styles.moreCards}>
                <summary>Show {entry.cards.length - SHOWN_CARDS} more {entry.cards.length - SHOWN_CARDS === 1 ? "card" : "cards"}</summary>
                <CardList cards={entry.cards.slice(SHOWN_CARDS)} />
              </details>}
            </> : <>
              <p className={styles.who}>{actorLabel(entry.actor)} made {entry.steps.length === 1 ? "a change" : `${entry.steps.length} changes`}</p>
              <ul className={styles.steps}>
                {entry.steps.map(step => <li key={step.id} className={styles.step}>
                  <span className={styles.stepLabel}>{step.label}</span>
                  {step.seconds !== null && <Link className={styles.jump} href={`/p/${projectId}?at=${step.seconds}`} aria-label={`Go to ${clock(step.seconds)}: ${step.label}`}>Go to {clock(step.seconds)}</Link>}
                </li>)}
              </ul>
            </>}
          </div>
        </li>)}
      </ol>
    </section>)}
    {view.chapter_page.next_cursor && <button type="button" className={`${styles.action} ${styles.more}`} onClick={onShowEarlier}>Show earlier</button>}

  </div>;
}
