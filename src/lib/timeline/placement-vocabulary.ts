/**
 * The words of a relation placement (`props.place`, resolved in placement-relation.ts). Kept free of
 * imports so the review card's dials can use them in the browser.
 */
export const PLACE_PROP = "place";
export const PLACEMENT_SIDES = ["below", "above", "left", "right", "inside"] as const;
export const PLACEMENT_ALIGNS = ["start", "center", "end"] as const;
/** Gap between follower and anchor, as a share of the canvas height (like shape sizes). */
export const PLACEMENT_GAP = { min: 0, max: 0.3, default: 0.02 } as const;

export type PlacementSide = (typeof PLACEMENT_SIDES)[number];
export type PlacementAlign = (typeof PLACEMENT_ALIGNS)[number];
/** Inside only: which edge the follower sits against vertically (start top, end bottom); centred by default. */
export type PlacementRelation = { relative_to: string[]; side: PlacementSide; gap: number; align: PlacementAlign; vertical_align?: PlacementAlign };
