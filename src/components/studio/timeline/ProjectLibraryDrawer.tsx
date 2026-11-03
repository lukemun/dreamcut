"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AssetShelf } from "./AssetShelf";
import { MediaDrawer } from "./MediaDrawer";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { matchesShortcut } from "@/lib/keyboard-shortcuts";

type ReferencePicker = { nonce: number; onChoose: (source: string) => Promise<void> };
type LibraryControls = { open: boolean; toggle: () => void; browse: () => void; chooseReference: (onChoose: ReferencePicker["onChoose"]) => void };
const LibraryContext = createContext<LibraryControls | null>(null);
export const useProjectLibrary = () => useContext(LibraryContext);

/** Non-editor project pages share the editor's actual shelf and drawer owners. */
export function ProjectLibraryProvider({ projectId, route, children }: { projectId: string; route: string; children: ReactNode }) {
  const enabled = route !== "editor";
  const [open, setOpen] = useState(false), [mounted, setMounted] = useState(false);
  const [picker, setPicker] = useState<ReferencePicker>();
  const shortcut = useKeyboardShortcuts().library;
  const close = useCallback(() => { setOpen(false); setPicker(undefined); }, []);
  const browse = useCallback(() => { setPicker(undefined); setMounted(true); setOpen(true); }, []);
  const toggle = useCallback(() => { setPicker(undefined); setMounted(true); setOpen(value => !value); }, []);
  const chooseReference = useCallback((onChoose: ReferencePicker["onChoose"]) => {
    setPicker({ nonce: Date.now(), onChoose: async source => { await onChoose(source); setOpen(false); setPicker(undefined); } }); setMounted(true); setOpen(true);
  }, []);
  useEffect(() => { setOpen(false); setPicker(undefined); }, [route, projectId]);
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => { if (matchesShortcut(event, shortcut)) { event.preventDefault(); toggle(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, shortcut, toggle]);
  return <LibraryContext.Provider value={{ open, toggle, browse, chooseReference }}>
    {children}
    {enabled && mounted && <MediaDrawer open={open} onClose={close}>
      <AssetShelf projectId={projectId} open={open} width={440} onWidthChange={() => {}} onClose={close} beats={[]}
        drawerMode inlineGenerate workflowPanes={["browse", "generate"]} showAdvancedTools={false} referencePicker={picker} />
    </MediaDrawer>}
  </LibraryContext.Provider>;
}
