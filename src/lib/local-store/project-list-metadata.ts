import { readJsonFile } from "./atomic-json";
import { projectMetadataPath } from "./paths";

/** Browsing projects must not require valid editing/export settings. Keep strict
 * validation in readMetadata when a project is actually opened for editing. */
export function readProjectListMetadata(id: string) {
  const value = readJsonFile<unknown>(projectMetadataPath(id), null);
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    title: typeof data.title === "string" && data.title.trim() ? data.title : id,
    versionLabel: typeof data.version_label === "string" && data.version_label.trim()
      ? data.version_label : null,
  };
}
