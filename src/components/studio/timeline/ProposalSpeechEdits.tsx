"use client";

import type { ProposalOptionReview } from "./timeline-client";

type SpeechEdit = NonNullable<ProposalOptionReview["speech_edits"]>[number];

/** "…" marks words that continue past the context shown, but not after a line that already ends. */
const trail = (text: string) => (/[.!?]$/.test(text) ? "" : "…");

/**
 * What a cut does to the creator's words, read as a passage of what they said: the removed
 * words are struck through in place, and a tightened pause shows how much of it goes.
 */
export function ProposalSpeechEdits({ edits }: { edits: readonly SpeechEdit[] }) {
  if (!edits.length) return null;
  return (
    <div className="mt-3 space-y-2 text-[15px] leading-7 text-[var(--ink)]">
      {edits.map((edit, index) => (
        <p key={index} className="min-w-0 break-words rounded-[var(--edge-control)] border border-[var(--edge-outline)] px-3 py-2">
          …{edit.before}{" "}
          {edit.removed ? (
            <del className="text-[var(--proposal-warning)] decoration-[var(--proposal-warning)] decoration-2">{edit.removed}</del>
          ) : (
            <del className="whitespace-nowrap rounded bg-[var(--chrome-raised)] px-1.5 text-[13px] text-[var(--proposal-warning)] no-underline">
              pause {edit.seconds.toFixed(1)} s
            </del>
          )}
          {" "}{edit.after}{trail(edit.after)}
        </p>
      ))}
    </div>
  );
}
