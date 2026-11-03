"use client";
import { useLayoutEffect, type RefObject } from "react";

/**
 * Expands a preview to fill the window while `active`: the element joins the top layer, the rest
 * of the page goes inert, Tab stays inside it and Escape calls `onExit`. Pair it with the
 * `preview-window-fullscreen` class. The top layer escapes editor clipping and stacking without
 * native app fullscreen (which embedded browsers may never grant) or moving/remounting the
 * element, its decoders, or its playback session.
 */
export function useWindowFullscreen(container: RefObject<HTMLElement | null>, active: boolean, onExit: () => void) {
  useLayoutEffect(() => {
    if (!active || !container.current) return;
    const player = container.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    player.setAttribute("popover", "manual");
    player.showPopover();
    const background: Array<{ element: HTMLElement; inert: boolean }> = [];
    let branch: HTMLElement = player;
    while (branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          background.push({ element: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
      branch = branch.parentElement;
      if (branch === document.body) break;
    }
    player.querySelector<HTMLButtonElement>(".preview-fullscreen")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (player.querySelector(":popover-open")) return;
        event.preventDefault(); event.stopImmediatePropagation(); onExit();
      } else if (event.key === "Tab") {
        const controls = [...player.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      player.hidePopover();
      player.removeAttribute("popover");
      background.forEach(({ element, inert }) => { element.inert = inert; });
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [active, container, onExit]);
}
