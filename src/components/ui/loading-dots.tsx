import styles from "./loading-dots.module.css";

/** Compact activity indicator that keeps the surrounding control in place. */
export function LoadingDots() {
  return (
    <span aria-hidden="true" className="inline-flex items-baseline gap-[0.08em] font-mono leading-none">
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
