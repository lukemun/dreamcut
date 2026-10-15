"use client";

import { createContext } from "react";

export type DrawerSide = "left" | "right";

/** The edge the enclosing drawer slides from, so its header puts the close control on the inner edge. */
export const DrawerSideContext = createContext<DrawerSide>("right");

/** Editor drawers slide out away from the preview: from the left in Wide (the preview is on the right),
 *  from the right in Tall and outside the editor. */
export function editorDrawerSide(): DrawerSide {
  return document.querySelector(".editor-playback-workspace--horizontal") ? "left" : "right";
}
