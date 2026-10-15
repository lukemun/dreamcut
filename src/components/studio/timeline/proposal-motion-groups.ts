import type { ProposalMotionControl, ProposalMotionItem, ProposalOptionReview } from "./timeline-client";

type Values = Record<string, string | number | boolean>;

/**
 * Graphic dial panels for one option, one entry per graphic: clips that use the same
 * composition share an entry (shown as one grouped panel), in the order they appear.
 */
export function motionGroups(items: readonly ProposalMotionItem[] | undefined): ProposalMotionItem[][] {
  const groups = new Map<string, ProposalMotionItem[]>();
  for (const item of items ?? []) {
    if (item.kind !== "composition" || !item.controls?.some((control) => !control.fixed)) continue;
    groups.set(item.id, [...(groups.get(item.id) ?? []), item]);
  }
  return [...groups.values()];
}

/** The clip's own name for a graphic's dials: the review row for that operation. */
export function motionItemTitle(option: Pick<ProposalOptionReview, "rows" | "adjustment_rows">, item: Pick<ProposalMotionItem, "operation_index">) {
  return [...(option.adjustment_rows ?? []), ...option.rows]
    .find((row) => row.changes.some((change) => change.operation_index === item.operation_index))?.element_label;
}

/**
 * Settings that every copy shares appear once; only what differs between copies (a card's
 * number and title) appears per clip. Which is which is decided from the authored values, so
 * the split stays put while the creator tunes. A shared change re-renders every copy.
 */
export function splitSharedControls(controls: readonly ProposalMotionControl[], valuesPerCopy: readonly Values[]) {
  const shared: ProposalMotionControl[] = [], own: ProposalMotionControl[] = [];
  for (const control of controls) {
    const first = valuesPerCopy[0]?.[control.id] ?? control.default;
    (valuesPerCopy.every((values) => (values[control.id] ?? control.default) === first) ? shared : own).push(control);
  }
  return { shared, own };
}


/**
 * A graphic's dials on a card. The agent picks the main dials for each change
 * (`motion_main_controls`); the rest sit in Advanced. Without a pick: when the card swaps a placed render of the same graphic, the
 * settings it changes are the main dials and the rest sit in Advanced (all of them when it
 * only re-renders, as for a fix in the graphic's code). A new graphic shows every dial. A fixed
 * control (which section a header announces, how long it runs) is set where the graphic is
 * placed and never shown.
 */
export function motionControlTiers(controls: readonly ProposalMotionControl[], copies: ReadonlyArray<Pick<ProposalMotionItem, "values" | "replaced_values">>, chosen?: readonly string[]) {
  const shown = controls.filter((control) => !control.fixed);
  if (chosen) return { main: shown.filter((control) => chosen.includes(control.id)), advanced: shown.filter((control) => !chosen.includes(control.id)) };
  if (!copies.length || copies.some((copy) => !copy.replaced_values)) return { main: shown, advanced: [] as ProposalMotionControl[] };
  const value = (values: Values | undefined, control: ProposalMotionControl) => values?.[control.id] ?? control.default;
  const changed = (control: ProposalMotionControl) => copies.some((copy) => value(copy.values, control) !== value(copy.replaced_values, control));
  return { main: shown.filter(changed), advanced: shown.filter((control) => !changed(control)) };
}
