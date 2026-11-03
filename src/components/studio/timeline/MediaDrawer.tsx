"use client";

import type { ReactNode } from "react";
import { SlideOutDrawer } from "./SlideOutDrawer";

export function MediaDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  return <SlideOutDrawer
    open={open}
    onClose={onClose}
    label="Media drawer"
    testId="media-drawer"
    widthStorageKey="dreamcut.library-drawer-width"
    width="min(600px, calc(100vw - 24px))"
  >{children}</SlideOutDrawer>;
}
