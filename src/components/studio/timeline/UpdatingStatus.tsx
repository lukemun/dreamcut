import { LoadingDots } from "@/components/ui/loading-dots";
import { cn } from "@/lib/utils";

/**
 * The one "still updating" mark for a motion graphic whose new settings have not rendered yet:
 * on its card and over the viewer. Amber, filled and bold so it reads at a glance, not as a caption.
 */
export function UpdatingStatus({ children = "Updating", className }: { children?: React.ReactNode; className?: string }) {
  return (
    <span
      role="status"
      data-updating-status
      className={cn(
        // The fill's padding sits outside the line, so a heading row keeps its height while it shows.
        "-my-0.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--edge-pill)] px-2 py-0.5 text-sm font-semibold",
        "bg-[color-mix(in_srgb,var(--proposal-warning)_18%,transparent)] text-[var(--proposal-warning)] ring-1 ring-[color-mix(in_srgb,var(--proposal-warning)_45%,transparent)]",
        className,
      )}
    >
      {children} <LoadingDots />
    </span>
  );
}
