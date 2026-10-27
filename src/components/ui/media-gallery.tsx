"use client";
import { Children, isValidElement, useEffect, useRef, useState, type CSSProperties, type ReactNode, type SyntheticEvent } from "react";
import { mediaGalleryRows } from "./media-gallery-layout";
import styles from "./media-gallery.module.css";

/** One natural-aspect gallery owner. Mark the primary image/video data-media-preview.
 * Wrappers keep stable keys while intrinsic dimensions and container size resolve,
 * so reflow does not remount video players or change selection/focus.
 * `masonry` packs natural-height cards down columns for catalogs with mixed preview shapes.
 * `evenRows` shows every preview in a row at that row's shared height (natural shape,
 * never cropped), so cards widened for their labels do not make the row ragged. */
export function MediaGallery({ children, className = "", targetHeight = 220, gap = 12, minCardWidth = 140, maxPerRow = Infinity, evenRows = false, masonry = false, columnCount }: {
  children: ReactNode; className?: string; targetHeight?: number; gap?: number; minCardWidth?: number; maxPerRow?: number; evenRows?: boolean; masonry?: boolean; columnCount?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0), [ratios, setRatios] = useState<Record<string, number>>({});
  const items = Children.toArray(children).map((child, index) => ({ child, key: isValidElement(child) ? String(child.key ?? index) : String(index) }));
  useEffect(() => {
    const node = host.current; if (!node) return;
    // Read live layout on the next frame: an entry delivered mid-resize can be stale, and a
    // stale narrow width would otherwise persist until the next size change.
    let frame = 0;
    const read = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => {
      const style = getComputedStyle(node);
      // Round down from the fractional width: clientWidth rounds and can round up, and a row packed to
      // a width a fraction too wide wraps its last card onto a line of its own.
      setWidth(Math.max(0, Math.floor(node.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth))));
    }); };
    const observer = new ResizeObserver(read);
    observer.observe(node); read();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  const measure = (event: SyntheticEvent) => {
    const media = event.target;
    if (!(media instanceof HTMLImageElement || media instanceof HTMLVideoElement) || !media.hasAttribute("data-media-preview")) return;
    const key = media.closest<HTMLElement>("[data-media-gallery-item]")?.dataset.mediaGalleryItem;
    const w = media instanceof HTMLImageElement ? media.naturalWidth : media.videoWidth;
    const h = media instanceof HTMLImageElement ? media.naturalHeight : media.videoHeight;
    if (key && w > 0 && h > 0) setRatios(current => current[key] === w / h ? current : { ...current, [key]: w / h });
  };
  // On a narrow host the label floor relaxes (to no less than 70%) when that lets two cards share a row.
  const floor = width ? Math.min(minCardWidth, Math.max(minCardWidth * 0.7, (width - gap) / 2)) : minCardWidth;
  const { widths, heights } = mediaGalleryRows(items.map(i => ratios[i.key] ?? 1), width, targetHeight, gap, floor, maxPerRow);
  return <div ref={host} className={`${styles.gallery} ${className}`} style={masonry ? { ...(columnCount ? { columnCount } : { columns: `${minCardWidth}px` }), columnGap: gap } : { display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap }}
    onLoadCapture={measure} onLoadedMetadataCapture={measure} data-media-gallery>
    {items.map((item, index) => <div key={item.key} data-media-gallery-item={item.key} className={styles.item} data-even-rows={evenRows || undefined}
      // The floor keeps a card readable even if the packed width is momentarily wrong; cards wrap instead.
      style={{ ...(masonry ? { display: "block", breakInside: "avoid", marginBottom: gap } as CSSProperties : {}), width: masonry ? "100%" : width ? `${Math.floor(widths[index] * 100) / 100}px` : `min(100%, ${targetHeight}px)`, minWidth: masonry ? 0 : `min(100%, ${floor}px)`,
        ...(evenRows ? { "--media-row-height": `${Math.floor(width ? heights[index] : targetHeight)}px` } as CSSProperties : {}) }}>{item.child}</div>)}
  </div>;
}
