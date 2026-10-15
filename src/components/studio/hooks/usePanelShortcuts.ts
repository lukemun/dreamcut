"use client";

import { useEffect, useState } from "react";
import { DEFAULT_PANEL_SHORTCUTS, PANEL_SHORTCUT_EVENT, PANEL_SHORTCUT_STORAGE_KEY, parsePanelShortcuts, type PanelShortcuts } from "@/lib/panel-shortcuts";
import { getStoredItem } from "@/lib/persisted-key";

function readCachedShortcuts(): PanelShortcuts {
  if (typeof window === "undefined") return DEFAULT_PANEL_SHORTCUTS;
  try { return parsePanelShortcuts(JSON.parse(getStoredItem(window.localStorage, PANEL_SHORTCUT_STORAGE_KEY) || "null")); }
  catch { return DEFAULT_PANEL_SHORTCUTS; }
}

export function publishPanelShortcuts(shortcuts: PanelShortcuts) {
  try { window.localStorage.setItem(PANEL_SHORTCUT_STORAGE_KEY, JSON.stringify(shortcuts)); } catch { /* Profile remains authoritative. */ }
  window.dispatchEvent(new Event(PANEL_SHORTCUT_EVENT));
}

export function usePanelShortcuts(): PanelShortcuts {
  const [shortcuts, setShortcuts] = useState<PanelShortcuts>(DEFAULT_PANEL_SHORTCUTS);
  useEffect(() => {
    let active = true;
    setShortcuts(readCachedShortcuts());
    const update = () => setShortcuts(readCachedShortcuts());
    const onStorage = (event: StorageEvent) => { if (event.key === PANEL_SHORTCUT_STORAGE_KEY) update(); };
    window.addEventListener(PANEL_SHORTCUT_EVENT, update);
    window.addEventListener("storage", onStorage);
    void fetch("/api/panel-shortcuts").then(async response => {
      if (!response.ok) throw new Error("Could not load panel shortcuts");
      const data = await response.json();
      if (active) publishPanelShortcuts(parsePanelShortcuts(data));
    }).catch(() => {});
    return () => {
      active = false;
      window.removeEventListener(PANEL_SHORTCUT_EVENT, update);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return shortcuts;
}
