import path from "node:path";
import { profileDir } from "./editing-memory";
import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";
import { parsePreviewQuality, type PreviewQuality } from "../preview-quality";
const settingsPath = () => path.join(profileDir(), "preview-settings.json");
export function readPreviewSettings() {
  const record = readJsonFile<{ quality?: unknown } | null>(settingsPath(), null);
  return { quality: parsePreviewQuality(record?.quality), configured: record !== null };
}
export function writePreviewSettings(quality: PreviewQuality) {
  writeJsonFileAtomic(settingsPath(), { quality });
  return readPreviewSettings();
}
