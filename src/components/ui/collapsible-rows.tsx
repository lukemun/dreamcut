"use client";

import type { CSSProperties, ReactNode } from "react";

export function CollapsibleRows({
  expanded,
  id,
  children,
  durationMs = 280,
  opacityDurationMs = 200,
}: {
  expanded: boolean;
  id?: string;
  children: ReactNode;
  durationMs?: number;
  opacityDurationMs?: number;
}) {
  const gridStyle: CSSProperties = {
    gridTemplateRows: expanded ? "1fr" : "0fr",
    transition: `grid-template-rows ${durationMs}ms cubic-bezier(0.4, 0, 0.2, 1)`,
  };
  const opacityStyle: CSSProperties = {
    opacity: expanded ? 1 : 0,
    transitionDuration: `${opacityDurationMs}ms`,
  };

  return (
    <div
      id={id}
      className="grid motion-reduce:transition-none"
      style={gridStyle}
      aria-hidden={!expanded}
    >
      <div
        className="overflow-hidden transition-opacity ease-out motion-reduce:transition-none"
        style={opacityStyle}
      >
        {children}
      </div>
    </div>
  );
}
