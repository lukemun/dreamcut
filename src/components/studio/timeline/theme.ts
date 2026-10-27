/**
 * Editor chrome tokens — the single place a colour is named.
 *
 * Plan: docs/plans/2026-07-13-editor-chrome-redesign.md
 *
 * These are `var(--…)` references, not hex. Components must never inline a colour
 * literal: the editor accumulated 395 of them, and the dominant idiom was
 * `rgba(255,255,255,0.08)` — a white-alpha overlay that only works on a near-black
 * background, which is exactly why the theme could not move.
 *
 * The rule that matters: **selection, hover, focus and drag are INK, not hue.**
 * (`docs/standards/ui-design-system.md` §10.) Colour in this editor means one of
 * exactly two things — DATA (lane identity, waveform, QC severity) or the single
 * CTA (export). If you are reaching for the accent to say "this one is selected",
 * you are reaching for the wrong thing.
 */

export const chrome = {
  /** App floor — timeline body, toolbar. */
  deep: "var(--chrome-deep)",
  /** Panels, menus, the asset shelf. */
  panel: "var(--chrome-panel)",
  /** The field immediately around the video frame. Carries no text, by convention. */
  surround: "var(--viewing-surround)",
  /** Hover / selected surfaces, clips, inputs. */
  raised: "var(--chrome-raised)",

  ink: "var(--ink)",
  inkMuted: "var(--ink-muted)",

  line: "var(--chrome-line)",
  lineStrong: "var(--chrome-line-strong)",

  selectedBg: "var(--chrome-selected-bg)",
  selectedRing: "var(--chrome-selected-ring)",
  focusRing: "var(--chrome-focus-ring)",
} as const;

/** A field label: readable sentence case in primary ink (same treatment as InspectorPropertyControl). */
export const labelClass =
  "text-[13px] font-medium text-[var(--ink)]";

/** A control surface: input, select trigger, button. One height, one radius, everywhere. */
export const controlClass =
  "h-9 rounded-md border border-[var(--chrome-line)] bg-[var(--chrome-raised)] text-[0.88rem] text-[var(--ink)] transition-colors hover:border-[var(--chrome-line-strong)]";

/** Focus is a neutral ring — never the brand accent. */
export const focusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)]";

/** Numeric readouts use tabular figures so digits don't shimmy while the playhead counts. */
export const tabularClass = "tabular";
