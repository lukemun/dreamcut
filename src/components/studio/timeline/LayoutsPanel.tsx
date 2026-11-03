"use client";

import { CatalogTile, CatalogTileGrid } from "./CatalogTile";
import { useChatSelection } from "./useChatSelection";
import { LAYOUT_PRESETS, layoutAgentText, type LayoutPreset } from "@/lib/timeline/layout-presets";

const SLOT_COLORS = ["--layout-slot-1", "--layout-slot-2", "--layout-slot-3", "--layout-slot-4"].map(token => `var(${token})`);

/** The slot diagram drawn in the canvas's own shape; each slot gets its own color so the sections read apart. */
function LayoutDiagram({ preset, aspect }: { preset: LayoutPreset; aspect: number }) {
  const width = 100 * aspect;
  return <svg viewBox={`0 0 ${width} 100`} className="layout-diagram" role="presentation" style={{ height: "100%", maxWidth: "100%" }}>
    <rect x={0} y={0} width={width} height={100} rx={4} fill="currentColor" opacity={0.1} />
    {preset.slots.map((slot, index) => ({ slot, index })).reverse().map(({ slot, index }) =>
      <rect key={index} x={slot.x * width + 1.5} y={slot.y * 100 + 1.5} width={slot.w * width - 3} height={slot.h * 100 - 3} rx={2.5}
        fill={SLOT_COLORS[index % SLOT_COLORS.length]} />)}
  </svg>;
}

/**
 * Screen layouts (split screens, grids, picture in picture). Clicking a layout selects it for the agent;
 * Add fills its slots with the clips selected on the timeline, front-most lane first.
 */
export function LayoutsPanel({ aspect, selectedClipCount, onApply }: {
  aspect: number;
  selectedClipCount: number;
  onApply: (preset: LayoutPreset) => void;
}) {
  const selection = useChatSelection("layouts");
  return <div className="asset-shelf-scroll" style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "auto", padding: "10px 12px" }}>
    <CatalogTileGrid label="Layouts">
      {LAYOUT_PRESETS.map(preset => {
        const id = `layout:${preset.id}`;
        return <CatalogTile key={preset.id} label={preset.label} detail={`${preset.slots.length} slots`}
          preview={<LayoutDiagram preset={preset} aspect={aspect} />}
          selected={selection.selectedIds.has(id)}
          onSelect={() => selection.toggle({ id, kind: "Layout", label: preset.label, agentText: layoutAgentText(preset) })}
          addLabel={selectedClipCount ? `Fill with the ${selectedClipCount} selected clip${selectedClipCount === 1 ? "" : "s"}` : "Select clips on the timeline to fill this layout"}
          onAdd={() => onApply(preset)} adding={selectedClipCount === 0} />;
      })}
    </CatalogTileGrid>
  </div>;
}
