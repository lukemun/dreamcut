"use client";

import { useContext, type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";
import { DrawerCloseButton } from "./DrawerCloseButton";
import { DrawerSideContext, type DrawerSide } from "./drawer-side";

/** Shared top rail for editor drawers. The close control sits on the drawer's inner edge: leading in a
 *  right-hand drawer, trailing in a left-hand one. The side comes from the enclosing SlideOutDrawer. */
export function DrawerHeader({ closeLabel, onClose, closeButtonRef, children, showClose = true, side: sideOverride }: {
  closeLabel: string;
  onClose: () => void;
  closeButtonRef?: Ref<HTMLButtonElement>;
  children?: ReactNode;
  showClose?: boolean;
  side?: DrawerSide;
}) {
  const contextSide = useContext(DrawerSideContext);
  const side = sideOverride ?? contextSide;
  // One height and padding for every editor drawer (Library, Generate, Proposals), flush under the app header.
  return <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--chrome-line)] px-[14px]">
    {showClose && side === "right" && <DrawerCloseButton label={closeLabel} onClick={onClose} buttonRef={closeButtonRef} />}
    {children}
    {showClose && side === "left" && <span className="ml-auto"><DrawerCloseButton label={closeLabel} onClick={onClose} buttonRef={closeButtonRef} /></span>}
  </header>;
}

/** Tab semantics only; place inside a SegmentedControl, which owns the look. */
export function DrawerHeaderTab({ active, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  active: boolean;
}) {
  return <button type="button" role="tab" aria-selected={active} tabIndex={active ? 0 : -1} {...props}>{children}</button>;
}
