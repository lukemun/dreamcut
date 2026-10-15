"use client";

import { createContext, useContext, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";

type ChromeSlots = {
  projectActions: HTMLDivElement | null;
  setProjectActions: Dispatch<SetStateAction<HTMLDivElement | null>>;
  settingsActions: HTMLDivElement | null;
  setSettingsActions: Dispatch<SetStateAction<HTMLDivElement | null>>;
  exportActions: HTMLDivElement | null;
  setExportActions: Dispatch<SetStateAction<HTMLDivElement | null>>;
  /** Header slot for the editor's Tall/Wide workspace switch. */
  layoutActions: HTMLDivElement | null;
  setLayoutActions: Dispatch<SetStateAction<HTMLDivElement | null>>;
  /** Header slot for project-wide edit actions: Undo/History/Redo, Library and Proposals. */
  editActions: HTMLDivElement | null;
  setEditActions: Dispatch<SetStateAction<HTMLDivElement | null>>;
  /** Preview-corner slot for viewer actions on the current frame (capture frame). */
  viewerActions: HTMLDivElement | null;
  setViewerActions: Dispatch<SetStateAction<HTMLDivElement | null>>;
};
const WorkspaceChromeContext = createContext<ChromeSlots | null>(null);

export function WorkspaceChromeProvider({ children }: { children: ReactNode }) {
  const [projectActions, setProjectActions] = useState<HTMLDivElement | null>(null);
  const [settingsActions, setSettingsActions] = useState<HTMLDivElement | null>(null);
  const [exportActions, setExportActions] = useState<HTMLDivElement | null>(null);
  const [layoutActions, setLayoutActions] = useState<HTMLDivElement | null>(null);
  const [viewerActions, setViewerActions] = useState<HTMLDivElement | null>(null);
  const [editActions, setEditActions] = useState<HTMLDivElement | null>(null);
  return <WorkspaceChromeContext.Provider value={{ projectActions, setProjectActions, settingsActions, setSettingsActions, exportActions, setExportActions, layoutActions, setLayoutActions, viewerActions, setViewerActions, editActions, setEditActions }}>{children}</WorkspaceChromeContext.Provider>;
}
/** Null outside the workspace (embedded or standalone views): callers keep controls local. */
export function useOptionalWorkspaceChrome() { return useContext(WorkspaceChromeContext); }
export function useWorkspaceChrome() {
  const context = useContext(WorkspaceChromeContext);
  if (!context) throw new Error("Workspace chrome requires its provider");
  return context;
}
