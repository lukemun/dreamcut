"use client";

import { ArrowLeftToLineIcon, ArrowRightToLineIcon } from "lucide-react";
import { useContext, type Ref } from "react";
import { DrawerSideContext, type DrawerSide } from "./drawer-side";
import { Button } from "@/components/ui/button";

/** The arrow points the way the drawer leaves: right for a right-hand drawer, left for a left-hand one.
 *  The side comes from the enclosing SlideOutDrawer unless given. */
export function DrawerCloseButton({ label, onClick, buttonRef, side: sideOverride }: { label: string; onClick: () => void; buttonRef?: Ref<HTMLButtonElement>; side?: DrawerSide }) {
  const contextSide = useContext(DrawerSideContext);
  const side = sideOverride ?? contextSide;
  return <Button
    ref={buttonRef}
    variant="outline"
    size="icon"
    onClick={onClick}
    aria-label={label}
    title={label}
    className="h-8 w-8 shrink-0 border-[var(--edge-outline)] bg-[var(--chrome-deep)] text-[var(--ink-secondary)] shadow-sm hover:bg-[var(--chrome-raised)] hover:text-[var(--ink)]"
  >
    {side === "left" ? <ArrowLeftToLineIcon size={16} strokeWidth={2} /> : <ArrowRightToLineIcon size={16} strokeWidth={2} />}
  </Button>;
}
