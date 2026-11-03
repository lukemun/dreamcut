import fs from "node:fs";
import path from "node:path";

import { readJsonFile, writeJsonFileAtomic } from "@/lib/local-store/atomic-json";
import { projectDir } from "@/lib/local-store/paths";
import { auditionManifestSchema, type AuditionManifest } from "@/lib/timeline/auditions";

export type { AuditionManifest } from "@/lib/timeline/auditions";

export function auditionManifestPath(projectId: string): string {
  return path.join(projectDir(projectId), "analysis", "auditions.json");
}

export function readAuditionManifest(projectId: string): AuditionManifest | null {
  const file = auditionManifestPath(projectId);
  if (!fs.existsSync(file)) return null;
  return auditionManifestSchema.parse(readJsonFile<unknown>(file, null));
}

export function writeAuditionManifest(projectId: string, manifest: AuditionManifest): void {
  const parsed = auditionManifestSchema.parse(manifest);
  const file = auditionManifestPath(projectId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeJsonFileAtomic(file, parsed);
}
