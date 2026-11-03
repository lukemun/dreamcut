import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";

import { audioClipMetadata, clipSourceFileName } from "./clip-labels";
import type { TimelineElement } from "./types";

/**
 * The prop a clip's name is written to: shapes keep theirs in `title` (the only name a shape may
 * carry), everything else in `timeline_label`, which every clip label reads first. Captions are
 * named by their own text and compound clips by their group, so neither is renamed here.
 */
export function clipNameField(element: TimelineElement | null): "title" | "timeline_label" | null {
  if (!element || element.type === "caption_text" || element.props?.compound_clip_presentation === true) return null;
  return element.type === "shape" ? "title" : "timeline_label";
}

export function PropertiesSelectionTitle({ element, count = 0, transition = false, showSectionLabel = true, onRename }: {
  element: TimelineElement | null;
  count?: number;
  transition?: boolean;
  showSectionLabel?: boolean;
  /** Write a clip's new name; an empty name clears it so the clip's own name shows again. */
  onRename?: (patch: Record<string, unknown>) => void;
}) {
  const props = element?.props;
  const authored = [props?.compound_clip_label, props?.timeline_label, props?.label, props?.title, props?.text]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  const name = count > 1 ? `${count} items selected`
    : element ? authored ?? audioClipMetadata(element)?.title
      ?? clipSourceFileName(element)
      ?? element.type.replaceAll("_", " ")
    : transition ? "Transition" : "";
  const field = count > 1 || !onRename ? null : clipNameField(element);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name, element?.id]);
  const commit = () => {
    if (!field || draft.trim() === name) return;
    onRename?.({ [field]: draft.trim() || null });
  };
  return <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, flex: "1 1 0%", maxWidth: "100%" }}>
    {showSectionLabel && <span style={{ flexShrink: 0, fontSize: "var(--ui-text-small)", fontWeight: 600 }}>Properties</span>}
    {field ? (
      <Input aria-label="Clip name" value={draft} spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
          if (event.key === "Escape") { event.preventDefault(); setDraft(name); requestAnimationFrame(() => (event.target as HTMLInputElement).blur()); }
          event.stopPropagation();
        }}
        // Reads as the name until hovered or focused, then shows its field.
        className="h-7 -ml-1.5 border-transparent bg-transparent px-1.5 text-[length:var(--ui-text-small)] font-medium text-[var(--ink-secondary)] hover:border-[var(--edge-outline)] focus-visible:bg-[var(--glass-field)] focus-visible:text-[var(--ink)] md:text-[length:var(--ui-text-small)]" />
    ) : name ? <span title={name} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "var(--ui-text-small)", fontWeight: 500, color: "var(--ink-secondary)" }}>{name}</span> : null}
  </span>;
}
