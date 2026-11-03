import { useId, type ReactNode } from "react";
import { normalizeHandwritingWeight } from "../timeline/handwriting-weight";

/** Thicken only already revealed ink, leaving letter spacing and pen timing intact. */
export function HandwritingInkWeight({ children, weight, fontSize }: { children: ReactNode; weight: number; fontSize: number }) {
  const id = `ink-weight-${useId().replace(/:/g, "")}`;
  const radius = normalizeHandwritingWeight(weight) * fontSize / 100;
  if (radius === 0) return children;
  return <span style={{ display: "inline-block", verticalAlign: "middle", position: "relative" }}>
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
      <defs><filter id={id} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
        <feMorphology in="SourceGraphic" operator="dilate" radius={radius} />
      </filter></defs>
    </svg>
    <span data-handwriting-weight={weight} style={{ display: "inline-block", filter: `url(#${id})` }}>{children}</span>
  </span>;
}
