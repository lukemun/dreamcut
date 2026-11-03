import path from "node:path";
import { profileDir } from "./editing-memory";
import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";
import { parseKeyboardShortcuts, validateKeyboardShortcuts, type KeyboardShortcuts } from "../keyboard-shortcuts";

const settingsPath = () => path.join(profileDir(), "keyboard-shortcuts.json");

export function readKeyboardShortcuts(): KeyboardShortcuts {
  const record = readJsonFile<unknown>(settingsPath(), null);
  if (record) return parseKeyboardShortcuts(record);
  // Keep drawer keys chosen before every shortcut became configurable.
  const drawers = readJsonFile<Record<string, unknown> | null>(path.join(profileDir(), "panel-shortcuts.json"), null);
  if (drawers) return parseKeyboardShortcuts(drawers);
  const library = readJsonFile<{ shortcut?: unknown } | null>(path.join(profileDir(), "library-shortcut.json"), null);
  return parseKeyboardShortcuts({ library: library?.shortcut });
}

export function writeKeyboardShortcuts(value: unknown): KeyboardShortcuts {
  const shortcuts = validateKeyboardShortcuts(value);
  writeJsonFileAtomic(settingsPath(), shortcuts);
  return shortcuts;
}
