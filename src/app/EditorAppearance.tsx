"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { getStoredItem } from "@/lib/persisted-key";
import { EDITOR_LOOK_LABELS, EDITOR_LOOK_STORAGE_KEY, EDITOR_LOOKS, parseEditorLook, type EditorLook } from "./editor-look";
import { applyEditorTextSize, EDITOR_TEXT_SIZE_LABELS, EDITOR_TEXT_SIZE_STORAGE_KEY, EDITOR_TEXT_SIZES, parseEditorTextSize, readEditorTextSize, writeEditorTextSize, type EditorTextSize } from "./editor-text-size";

type Appearance = "light" | "dark" | "system";
const AppearanceContext = createContext<{
  appearance: Appearance; setAppearance: (value: Appearance) => void;
  textSize: EditorTextSize; setTextSize: (value: EditorTextSize) => void;
}>({ appearance: "dark", setAppearance: () => {}, textSize: "standard", setTextSize: () => {} });
const STORAGE_KEY = "dreamcut.appearance";

export function applyEditorAppearance(appearance: Appearance, systemDark: boolean, root: Pick<HTMLElement, "dataset" | "classList">) {
  const dark = appearance === "dark" || (appearance === "system" && systemDark);
  root.dataset.editorTheme = dark ? "dark" : "light";
  root.classList.toggle("dark", dark);
}

/** One preference controls DOM surfaces, portalled menus and canvas palette reads. */
export function EditorAppearanceProvider({ children }: { children: React.ReactNode }) {
  const [appearance, updateAppearance] = useState<Appearance>("dark");
  const [textSize, updateTextSize] = useState<EditorTextSize>("standard");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* Storage can be blocked. */ }
    updateTextSize(readEditorTextSize(storage));
    try {
      const stored = getStoredItem(localStorage, STORAGE_KEY);
      if (stored === "light" || stored === "dark" || stored === "system") updateAppearance(stored);
    } catch { /* Storage can be unavailable in private or restricted contexts. */ }
    setReady(true);
    const syncAppearance = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key === EDITOR_TEXT_SIZE_STORAGE_KEY || event.key === null) updateTextSize(parseEditorTextSize(event.newValue));
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      const value = event.newValue;
      updateAppearance(value === "light" || value === "system" ? value : "dark");
    };
    window.addEventListener("storage", syncAppearance);
    return () => window.removeEventListener("storage", syncAppearance);
  }, []);
  useLayoutEffect(() => {
    if (!ready) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      applyEditorAppearance(appearance, media.matches, document.documentElement);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [appearance, ready]);
  useLayoutEffect(() => {
    if (ready) applyEditorTextSize(textSize, document.documentElement);
  }, [textSize, ready]);
  const setAppearance = (value: Appearance) => {
    updateAppearance(value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* Keep the session preference. */ }
  };
  const setTextSize = (value: EditorTextSize) => {
    updateTextSize(value);
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* Keep the session preference. */ }
    writeEditorTextSize(storage, value);
  };
  return <AppearanceContext.Provider value={{ appearance, setAppearance, textSize, setTextSize }}>{children}</AppearanceContext.Provider>;
}

/** The look is read and written on the document root, where the startup script set it. */
function useEditorLook(): [EditorLook, (look: EditorLook) => void] {
  const [look, updateLook] = useState<EditorLook>("studio");
  useEffect(() => updateLook(parseEditorLook(document.documentElement.dataset.editorPalette)), []);
  const setLook = (value: EditorLook) => {
    updateLook(value);
    document.documentElement.dataset.editorPalette = value;
    try { localStorage.setItem(EDITOR_LOOK_STORAGE_KEY, value); } catch { /* Keep the session preference. */ }
  };
  return [look, setLook];
}

export function EditorAppearanceSettings() {
  const { appearance, setAppearance, textSize, setTextSize } = useContext(AppearanceContext);
  const [look, setLook] = useEditorLook();
  return <section aria-labelledby="appearance-title" className="space-y-3">
    <h3 id="appearance-title" className="text-sm font-semibold text-[var(--ink)]">Appearance</h3>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
      <span id="editor-theme-label">Theme</span>
      <SegmentedControl role="group" aria-labelledby="editor-theme-label">
        {([["dark", "Dark"], ["light", "Light"], ["system", "System"]] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={appearance === value} onClick={() => setAppearance(value)}>{label}</button>)}
      </SegmentedControl>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
      <span id="editor-look-label">Look</span>
      <SegmentedControl role="group" aria-labelledby="editor-look-label">
        {EDITOR_LOOKS.map(value => <button key={value} type="button" aria-pressed={look === value} onClick={() => setLook(value)}>{EDITOR_LOOK_LABELS[value]}</button>)}
      </SegmentedControl>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
      <span id="editor-text-size-label">Text size</span>
      <SegmentedControl role="group" aria-labelledby="editor-text-size-label">
        {EDITOR_TEXT_SIZES.map(size => <button key={size} type="button" aria-pressed={textSize === size} onClick={() => setTextSize(size)}>{EDITOR_TEXT_SIZE_LABELS[size]}</button>)}
      </SegmentedControl>
    </div>
  </section>;
}
