"use client";

import { useEffect, useState } from "react";
import { DEFAULT_KEYBOARD_SHORTCUTS, KEYBOARD_SHORTCUT_EVENT, KEYBOARD_SHORTCUT_STORAGE_KEY, parseKeyboardShortcuts, type KeyboardShortcuts } from "@/lib/keyboard-shortcuts";
import { getStoredItem } from "@/lib/persisted-key";

function readCachedShortcuts(): KeyboardShortcuts {
  if (typeof window === "undefined") return DEFAULT_KEYBOARD_SHORTCUTS;
  try { return parseKeyboardShortcuts(JSON.parse(getStoredItem(window.localStorage, KEYBOARD_SHORTCUT_STORAGE_KEY) || "null")); }
  catch { return DEFAULT_KEYBOARD_SHORTCUTS; }
}

export function publishKeyboardShortcuts(shortcuts: KeyboardShortcuts) {
  try { window.localStorage.setItem(KEYBOARD_SHORTCUT_STORAGE_KEY, JSON.stringify(shortcuts)); } catch { /* Profile remains authoritative. */ }
  window.dispatchEvent(new Event(KEYBOARD_SHORTCUT_EVENT));
}

let profileRead: Promise<void> | null = null;
function readProfileOnce() {
  profileRead ??= fetch("/api/keyboard-shortcuts").then(async response => {
    if (!response.ok) throw new Error("Could not load keyboard shortcuts");
    publishKeyboardShortcuts(parseKeyboardShortcuts(await response.json()));
  }).catch(() => { profileRead = null; });
  return profileRead;
}

/** The creator's key for every editor command; the profile is the source, the cache keeps first paint right. */
export function useKeyboardShortcuts(): KeyboardShortcuts {
  const [shortcuts, setShortcuts] = useState<KeyboardShortcuts>(DEFAULT_KEYBOARD_SHORTCUTS);
  useEffect(() => {
    setShortcuts(readCachedShortcuts());
    const update = () => setShortcuts(readCachedShortcuts());
    const onStorage = (event: StorageEvent) => { if (event.key === KEYBOARD_SHORTCUT_STORAGE_KEY) update(); };
    window.addEventListener(KEYBOARD_SHORTCUT_EVENT, update);
    window.addEventListener("storage", onStorage);
    void readProfileOnce();
    return () => {
      window.removeEventListener(KEYBOARD_SHORTCUT_EVENT, update);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return shortcuts;
}
