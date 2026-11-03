"use client";
import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { filterValueLabel } from "@/lib/library/filter-labels";

/** One labelled set of exclusive filter choices, e.g. Mood: All · calm · tense. Used by Library pages and editor panels.
 *  `menu` shows it as one pill ("Mood", then the chosen value) whose menu lists every choice, for narrow panels where a row of
 *  a dozen choices would wrap into a wall or hide most of them off the edge. */
export function FilterButtons({ label, value, values, onChange, allLabel = "All", wrap = false, labels, inline = false, menu = false }: { label: string; value: string; values: string[]; onChange: (value: string) => void; allLabel?: string; wrap?: boolean; /** Names for values whose data key is not the creator-facing word. */ labels?: Record<string, string>; /** Sits in a toolbar row: the choices speak for themselves, so the label is for screen readers only. */ inline?: boolean; menu?: boolean }) {
  // Marks which edges hide more choices so only those fade.
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = row.current?.querySelector<HTMLElement>(".library-filter-scroll");
    if (!scroller) return;
    const update = () => {
      scroller.dataset.moreLeft = scroller.scrollLeft > 2 ? "true" : "false";
      scroller.dataset.moreRight = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 2 ? "true" : "false";
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    scroller.addEventListener("scroll", update, { passive: true });
    return () => { observer.disconnect(); scroller.removeEventListener("scroll", update); };
  }, [values.length]);
  if (values.length === 0) return null;
  const nameOf = (option: string) => option === "all" ? allLabel : labels?.[option] ?? filterValueLabel(option);
  if (menu) {
    return <Select value={value} onValueChange={next => { if (typeof next === "string") onChange(next); }}>
      <SelectTrigger variant="chip" aria-label={`${label}: ${nameOf(value)}`} data-active={value !== "all" || undefined}
        className="library-filter-menu">
        {/* "Mood" until a choice narrows the list, then the choice itself. */}
        <span className="truncate">{value === "all" ? label : nameOf(value)}</span>
        <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 opacity-70" />
      </SelectTrigger>
      <SelectContent align="start" className="w-auto min-w-44">
        {["all", ...values].map(option => <SelectItem key={option} value={option}>{nameOf(option)}</SelectItem>)}
      </SelectContent>
    </Select>;
  }
  // One line per filter: the label stays beside its choices, and a long list scrolls sideways rather than clipping.
  return <div ref={row} className="flex min-w-0 max-w-full items-center gap-2">
    {!inline && <span className="shrink-0 text-[13px] font-medium text-[var(--ink-secondary)]">{label}</span>}
    <SegmentedControl size="sm" wrap={wrap} className={wrap ? "min-w-0 max-w-full" : "library-filter-scroll min-w-0 max-w-full"} aria-label={label}>
      {["all", ...values].map((option) => <button key={option} type="button" className="library-filter" aria-pressed={value === option} onClick={() => onChange(option)}>
        {nameOf(option)}</button>)}
    </SegmentedControl>
  </div>;
}
