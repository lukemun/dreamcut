"use client";
import { useCallback, useEffect, useState } from "react";
import { Grid3X3Icon, LayoutGridIcon, SquareIcon } from "lucide-react";

import { SegmentedControl } from "@/components/ui/segmented-control";

export type ThumbnailSize = "small" | "medium" | "large";
const SIZES: readonly ThumbnailSize[] = ["small", "medium", "large"];

/** A remembered thumbnail size for one gallery (Generate results, Templates); per viewer, never project data. */
export function useThumbnailSize(storageKey: string, enabled = true): [ThumbnailSize, (size: ThumbnailSize) => void] {
  const [size, setSize] = useState<ThumbnailSize>("medium");
  useEffect(() => {
    if (!enabled) return;
    try { const saved = localStorage.getItem(storageKey); if (saved && (SIZES as readonly string[]).includes(saved)) setSize(saved as ThumbnailSize); } catch { /* Session-only preference. */ }
  }, [storageKey, enabled]);
  const choose = useCallback((next: ThumbnailSize) => {
    setSize(next);
    try { localStorage.setItem(storageKey, next); } catch { /* Session-only preference. */ }
  }, [storageKey]);
  return [size, choose];
}

/** Small, medium and large thumbnails, as three icon buttons beside a gallery's search. */
export function ThumbnailSizeControl({ value, onChange }: { value: ThumbnailSize; onChange: (size: ThumbnailSize) => void }) {
  return <SegmentedControl size="sm" role="group" aria-label="Thumbnail size">
    {([
      { value: "small", label: "Small thumbnails", Icon: Grid3X3Icon },
      { value: "medium", label: "Medium thumbnails", Icon: LayoutGridIcon },
      { value: "large", label: "Large thumbnails", Icon: SquareIcon },
    ] as const).map(({ value: option, label, Icon }) => (
      <button type="button" key={option} aria-label={label} title={label}
        aria-pressed={value === option} style={{ paddingInline: 6 }} onClick={() => onChange(option)}>
        <Icon size={16} aria-hidden="true" />
      </button>
    ))}
  </SegmentedControl>;
}
