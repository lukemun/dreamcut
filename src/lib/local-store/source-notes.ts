import path from "node:path";
import { z } from "zod";
import { projectDir } from "./paths";
import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";
import { readProjectSourceManifest } from "./media-ingest";

export const sourceNotesSchema = z.object({
  kind: z.enum(["music", "sound_effect"]).default("music"),
  title: z.string().trim().max(240),
  description: z.string().max(8000),
  moments: z.array(z.object({ id: z.string().min(1), start: z.number().finite().nonnegative(), end: z.number().finite().nonnegative(), note: z.string().max(2000) }).refine(v => v.end >= v.start)).max(200),
});
export type SourceNotes = z.infer<typeof sourceNotesSchema>;
type Saved = SourceNotes & { revision: number; source_sha256: string };
const file = (id: string) => path.join(projectDir(id), "source-notes.json");
export function readSourceNotes(projectId: string, assetId: string): Saved {
  const asset = readProjectSourceManifest(projectId).assets.find(a => a.asset_id === assetId);
  if (!asset) throw new Error("Imported source not found");
  const saved = readJsonFile<Record<string, Saved>>(file(projectId), {})[assetId];
  if (saved && saved.source_sha256 !== asset.source_sha256) throw new Error("Source changed; review its notes before continuing");
  return saved ?? { kind: "music", title: asset.original_filename, description: "", moments: [], revision: 0, source_sha256: asset.source_sha256 };
}
export function writeSourceNotes(projectId: string, assetId: string, expectedRevision: number, value: unknown) {
  const notes = sourceNotesSchema.parse(value);
  const current = readSourceNotes(projectId, assetId);
  if (current.revision !== expectedRevision) throw new Error("Notes changed in another window. Reopen Notes & moments before saving.");
  const all = readJsonFile<Record<string, Saved>>(file(projectId), {});
  const next = { ...notes, revision: current.revision + 1, source_sha256: current.source_sha256 };
  writeJsonFileAtomic(file(projectId), { ...all, [assetId]: next });
  return next;
}
