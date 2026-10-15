import path from "node:path";
import { profileDir } from "./editing-memory";
import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";
import { DEFAULT_PANEL_SHORTCUTS, parsePanelShortcut, parsePanelShortcuts, validatePanelShortcuts, type PanelShortcuts } from "../panel-shortcuts";

const settingsPath = () => path.join(profileDir(), "panel-shortcuts.json");

export function readPanelShortcuts(): PanelShortcuts {
  const record = readJsonFile<unknown>(settingsPath(), null);
  if (record) return parsePanelShortcuts(record);
  // Preserve the Library choice made before Proposals became configurable.
  const legacy = readJsonFile<{ shortcut?: unknown } | null>(path.join(profileDir(), "library-shortcut.json"), null);
  return { ...DEFAULT_PANEL_SHORTCUTS, library: parsePanelShortcut(legacy?.shortcut, DEFAULT_PANEL_SHORTCUTS.library) };
}

export function writePanelShortcuts(value: unknown): PanelShortcuts {
  const shortcuts = validatePanelShortcuts(value);
  writeJsonFileAtomic(settingsPath(), shortcuts);
  return shortcuts;
}
