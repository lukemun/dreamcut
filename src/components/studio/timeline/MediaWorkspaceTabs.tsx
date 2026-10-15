"use client";

import { Library, Sparkles, Layers, SlidersHorizontal, Captions, Music4, AudioLines, Type, LayoutGrid, type LucideIcon } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";

export type MediaWorkspacePane = "browse" | "generate" | "recipes" | "captions" | "music" | "sounds" | "text";

const PANES: MediaWorkspacePane[] = ["browse", "generate", "recipes"];
/** The editor's left tool rail, top to bottom: Templates, Layouts, Captions, Text, Properties (2026-10-13).
 *  Properties and Layouts are owned outside the media workspace. */
const EDITOR_PANES = ["browse", "music", "sounds", "recipes", "layouts", "captions", "text", "properties"] as const;

type RailItem = MediaWorkspacePane | "properties" | "layouts";

const PANE_META: Record<RailItem, { label: string; Icon: LucideIcon }> = {
  browse: { label: "Browse", Icon: Library },
  generate: { label: "Generate", Icon: Sparkles },
  recipes: { label: "Templates", Icon: Layers },
  captions: { label: "Captions", Icon: Captions },
  music: { label: "Music", Icon: Music4 },
  sounds: { label: "Sounds", Icon: AudioLines },
  text: { label: "Text", Icon: Type },
  properties: { label: "Properties", Icon: SlidersHorizontal },
  layouts: { label: "Layouts", Icon: LayoutGrid },
};

/** The editor rail's Properties item (owned by the inspector) and the panel's fold state. */
export type EditorRailConfig = { active: boolean; onSelect: () => void; controls: string; hidden?: boolean; collapsed?: boolean; onReselect?: () => void;
  /** Screen layouts, owned outside the media workspace like Properties; listed after Templates. */
  layouts?: { active: boolean; onSelect: () => void; controls: string } };

export function MediaWorkspaceTabs({ active, onSelect, idPrefix = "media-visual", controls, browseLabel = "Browse", properties, panes: paneSubset }: {
  browseLabel?: string;
  /** Editor rail mode. `hidden` drops the Properties item when Properties is always visible elsewhere (tall layout).
   *  When `collapsed`, no item reads as selected; `onReselect` runs when the open item is clicked again (it collapses the panel). */
  properties?: EditorRailConfig;
  /** Editor panes this instance offers (e.g. the Library drawer's Library · Generate · Music · Sounds, or
   *  Wide's tool rail without them); rail order stays the editor's. */
  panes?: readonly MediaWorkspacePane[];
  active: MediaWorkspacePane;
  onSelect: (pane: MediaWorkspacePane) => void;
  idPrefix?: string;
  controls?: Partial<Record<MediaWorkspacePane, string>>;
}) {
  const editorPanes: readonly RailItem[] = properties
    ? EDITOR_PANES.filter(pane => (pane !== "layouts" || !!properties.layouts) && (pane !== "properties" || !properties.hidden))
    : PANES;
  // A subset narrows the editor rail too; Properties and Layouts stay, since the inspector owns them.
  const panes: readonly RailItem[] = !paneSubset ? editorPanes
    : properties ? editorPanes.filter(pane => pane === "properties" || pane === "layouts" || paneSubset.includes(pane)) : paneSubset;
  const iconTabs = !!properties || !!paneSubset;
  const opened: RailItem = properties?.layouts?.active ? "layouts" : properties?.active && !properties.hidden ? "properties" : active;
  const selected: RailItem | null = properties?.collapsed ? null : opened;
  const select = (pane: RailItem) => {
    if (properties?.onReselect && pane === selected) return properties.onReselect();
    if (pane === "properties") properties?.onSelect();
    else if (pane === "layouts") properties?.layouts?.onSelect();
    else onSelect(pane);
  };
  const labelFor = (pane: RailItem) => pane === "browse" ? browseLabel : PANE_META[pane].label;
  // A drawer's tab strip fills its header and shrinks with it (icons drop first), never running under the close control.
  return <SegmentedControl fill={!properties && !!paneSubset} className={properties ? "editor-tool-rail" : !properties && paneSubset ? "min-w-0 flex-1" : undefined} aria-orientation={properties ? "vertical" : "horizontal"} role="tablist" aria-label={properties ? "Editing tools" : "Library workspace"}>
    {panes.map((pane, index) => {
      const { Icon } = PANE_META[pane];
      return <button key={pane} type="button" role="tab"
        id={`${idPrefix}-${pane}`} aria-controls={pane === "properties" ? properties?.controls : pane === "layouts" ? properties?.layouts?.controls : controls?.[pane] ?? `${idPrefix}-panel-${pane}`}
        aria-label={labelFor(pane)}
        title={labelFor(pane)}
        aria-selected={selected === pane}
        aria-expanded={properties?.onReselect && pane === opened ? !properties.collapsed : undefined}
        tabIndex={(selected ?? opened) === pane ? 0 : -1}
        onClick={() => select(pane)}
        onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          const next = event.key === "Home" ? panes[0] : event.key === "End" ? panes[panes.length - 1]
            : panes[(index + ((event.key === "ArrowRight" || event.key === "ArrowDown") ? 1 : panes.length - 1)) % panes.length];
          if (next === "properties") properties?.onSelect();
          else if (next === "layouts") properties?.layouts?.onSelect();
          else onSelect(next);
          document.getElementById(`${idPrefix}-${next}`)?.focus();
        }}
      >{iconTabs && <Icon size={16} aria-hidden="true" />}<span>{labelFor(pane)}</span></button>;
    })}
  </SegmentedControl>;
}
