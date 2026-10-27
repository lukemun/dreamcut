"use client";

import { CopyIcon, ScissorsIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";

import { inspectorQuietButtonClassName } from "./InspectorHierarchy";

import type { TimelineElement } from "./types";

export type SelectedClipActionsProps = {
  selectedElement: TimelineElement | null;
  onSplitSelected: () => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
};

/**
 * Split / Duplicate / Remove for whatever is selected on the timeline.
 *
 * ONE home per layout: both wide and tall workspaces render this in their
 * Properties header, beside the selection the actions operate on. Idle they are
 * plain labelled glyphs; hover and focus draw the fill (open space over lines).
 */
export function SelectedClipActions({
  selectedElement,
  onSplitSelected,
  onDuplicateSelected,
  onDeleteSelected,
}: SelectedClipActionsProps) {
  return (
    <div
      aria-label="Clip actions"
      role="group"
      style={{ display: "flex", alignItems: "center", gap: "0.2rem", flexShrink: 0 }}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onSplitSelected}
        disabled={!selectedElement}
        title="Split at playhead"
        aria-label="Split selected clip at playhead"
        className={inspectorQuietButtonClassName}
      >
        <ScissorsIcon size={15} strokeWidth={2} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onDuplicateSelected}
        disabled={!selectedElement}
        title="Duplicate"
        aria-label="Duplicate selected clip"
        className={inspectorQuietButtonClassName}
      >
        <CopyIcon size={15} strokeWidth={2} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onDeleteSelected}
        disabled={!selectedElement}
        title="Remove from timeline"
        aria-label="Remove selected clips from timeline"
        className={inspectorQuietButtonClassName}
      >
        <Trash2Icon size={15} strokeWidth={2} />
      </Button>
    </div>
  );
}
