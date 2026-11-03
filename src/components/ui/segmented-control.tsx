import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The one tab/selector group owner. Callers keep link, ARIA-tab or pressed-button
 * semantics on the children; this owns the look. `size="sm"` for panels, drawers and
 * toolbars; default for page sections. `fill` gives equal-width segments.
 */
export function SegmentedControl({ as: Element = "div", className, wrap = false, size = "md", fill = false, ...props }: ComponentPropsWithoutRef<"div"> & {
  as?: "div" | "nav"; wrap?: boolean; size?: "md" | "sm"; fill?: boolean;
}) {
  return <Element className={cn("segmented-control", size === "sm" && "segmented-control-sm", fill && "segmented-control-fill", wrap && "segmented-control-wrap", className)} {...props} />;
}

/** A count shown inside a segment, e.g. Results 14. */
export function SegmentCount({ children }: { children: React.ReactNode }) {
  return <span className="segmented-control-count">{children}</span>;
}
