import { audioClipMetadata } from "./clip-labels";
import type { TimelineElement } from "./types";

export function PropertiesSelectionTitle({ element, count = 0, transition = false, showSectionLabel = true }: {
  element: TimelineElement | null;
  count?: number;
  transition?: boolean;
  showSectionLabel?: boolean;
}) {
  const props = element?.props;
  const authored = [props?.compound_clip_label, props?.timeline_label, props?.label, props?.title, props?.text]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  const name = count > 1 ? `${count} items selected`
    : element ? authored ?? audioClipMetadata(element)?.title
      ?? element.source_url?.split("?")[0]?.split("/").pop()
      ?? element.type.replaceAll("_", " ")
    : transition ? "Transition" : "";
  return <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, flex: "1 1 0%", maxWidth: "100%" }}>
    {showSectionLabel && <span style={{ flexShrink: 0, fontSize: "var(--ui-text-small)", fontWeight: 600 }}>Properties</span>}
    {name ? <span title={name} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "var(--ui-text-small)", fontWeight: 500, color: "var(--ink-secondary)" }}>{name}</span> : null}
  </span>;
}
