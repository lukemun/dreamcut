function uniqueSorted(values: Iterable<string>) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function sortBottomToTop(keys: string[], persistedLaneOrder: Map<string, number>) {
  return keys.sort((a, b) => {
    const orderA = persistedLaneOrder.get(a);
    const orderB = persistedLaneOrder.get(b);
    if (typeof orderA === "number" && typeof orderB === "number") return orderB - orderA;
    if (typeof orderA === "number") return 1;
    if (typeof orderB === "number") return -1;
    return a.localeCompare(b);
  });
}

/** Returns authoritative compositing sibling order from back to front. */
export function buildCompositingLaneOrder({
  visualLaneKeys,
  captionLaneKeys,
  persistedLaneOrderKeys,
}: {
  visualLaneKeys: Iterable<string>;
  captionLaneKeys: Iterable<string>;
  persistedLaneOrderKeys: readonly string[];
}) {
  const visuals = uniqueSorted(visualLaneKeys);
  const captions = uniqueSorted(captionLaneKeys);
  const persistedLaneOrder = new Map(
    persistedLaneOrderKeys.map((key, index) => [key, index]),
  );
  const hasPersistedCaptionLane = persistedLaneOrderKeys.some((key) => key.startsWith("captions_"));

  if (!hasPersistedCaptionLane) {
    // Legacy projects never persisted caption lanes. Preserve their historical
    // render contract by keeping every caption above every visual.
    return [
      ...sortBottomToTop(visuals, persistedLaneOrder),
      ...captions,
    ];
  }

  return sortBottomToTop([...visuals, ...captions], persistedLaneOrder);
}

/** Stable caption paint order inside one lane, including simultaneous captions. */
export function compareCaptionPaintOrder(a:{timeline_start:number;id:string},b:{timeline_start:number;id:string}):number {
  return a.timeline_start-b.timeline_start||a.id.localeCompare(b.id);
}
