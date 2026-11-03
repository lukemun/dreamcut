import { cn } from "@/lib/utils";
import styles from "./loading-dots.module.css";

/** Compact activity indicator that keeps the surrounding control in place. Pass
 * `font-sans` to fit it in an icon's cell; the default monospace dots are wider. */
export function LoadingDots({ className }: { className?: string } = {}) {
  return (
    <span aria-hidden="true" className={cn("inline-flex items-baseline gap-[0.08em] font-mono leading-none", className)}>
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className={styles.period}
          style={{ animationDelay: `${dot * 150}ms` }}
        >.</span>
      ))}
    </span>
  );
}
