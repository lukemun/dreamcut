import path from "node:path";
import { profileDir } from "./editing-memory";
import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";

/** Project tabs open in the header, kept in the profile so they survive restarting the
 * desktop app (its browser storage starts empty on every launch). */
const settingsPath = () => path.join(profileDir(), "workspace-tabs.json");
const MAX_TABS = 40;
const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

export function parseWorkspaceTabs(value: unknown): string[] {
  const ids = Array.isArray((value as { open?: unknown } | null)?.open) ? (value as { open: unknown[] }).open : [];
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && PROJECT_ID.test(id)))].slice(0, MAX_TABS);
}

export function readWorkspaceTabs(): string[] {
  return parseWorkspaceTabs(readJsonFile<unknown>(settingsPath(), null));
}

export function writeWorkspaceTabs(value: unknown): string[] {
  const open = parseWorkspaceTabs(value);
  writeJsonFileAtomic(settingsPath(), { open });
  return open;
}
