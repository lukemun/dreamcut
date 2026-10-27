"use client";

import { createContext, useContext, type RefObject } from "react";

// Native popovers/fullscreen surfaces sit above every body portal, regardless
// of z-index. Their nested popups must stay inside that surface's top layer.
export const PopupContainer = createContext<RefObject<HTMLElement | null> | undefined>(undefined);
export const usePopupContainer = () => useContext(PopupContainer);
