export type FrameTagAnchor = {
  element_id: string | null;
  element_local_seconds: number | null;
  source_seconds: number | null;
};

export type FrameTagPoint = {
  /** Normalized composition coordinate, where 0 is left/top and 1 is right/bottom. */
  x: number;
  y: number;
};

export type FrameTag = {
  note?: string;
  id: string;
  label: string;
  timeline_seconds: number;
  frame_number: number;
  timeline_revision: number;
  active_element_ids: string[];
  anchor: FrameTagAnchor;
  /** Ordered composition-space points for tracing a path on this frame. */
  points?: FrameTagPoint[];
  /** Legacy single-point shape; readers migrate this into `points`. */
  point?: FrameTagPoint;
  created_at: string;
};

export function frameTagPoints(tag: Pick<FrameTag, "point" | "points">): FrameTagPoint[] {
  if (Array.isArray(tag.points) && tag.points.length > 0) return tag.points;
  return tag.point ? [tag.point] : [];
}

export type FrameTagsFile = {
  schema_version: 1;
  next_number: number;
  tags: FrameTag[];
};

export type FrameTagsResponse = {
  tags: FrameTag[];
  history?: {
    before: { id: string; op: string; at: string };
    after: { id: string; op: string; at: string };
  } | null;
};
