import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { profileDir } from "./editing-memory";
import { writeJsonFileAtomic } from "./atomic-json";
import { videoIdeaInputSchema, videoIdeaSchema, type VideoIdea } from "../video-ideas";

const uuid = z.string().uuid();
const root = (profile: string) => path.join(profile, "video-ideas");
function folder(id: string, profile: string) {
  const directory = path.join(root(profile), uuid.parse(id));
  // A record may never escape its profile through a symlink.
  if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) throw new Error("Invalid idea directory");
  return directory;
}
export function readVideoIdea(id: string, profile = profileDir()): VideoIdea {
  const file = path.join(folder(id, profile), "idea.json");
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error("Invalid idea record");
  const idea = videoIdeaSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  if (idea.id !== id) throw new Error("Idea identity mismatch");
  return idea;
}
export function listVideoIdeas(profile = profileDir()) {
  const ideas: VideoIdea[] = [], unavailable: string[] = [];
  if (!fs.existsSync(root(profile))) return { ideas, unavailable };
  for (const id of fs.readdirSync(root(profile))) {
    if (!uuid.safeParse(id).success) continue;
    try { ideas.push(readVideoIdea(id, profile)); } catch { unavailable.push(id); }
  }
  ideas.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return { ideas, unavailable };
}
export function saveVideoIdea(input: unknown, existing?: { id: string; expected_revision: number }, profile = profileDir(), media?: { reference?: string; poster?: string }) {
  const parsed = videoIdeaInputSchema.parse(input);
  if (existing && media) throw new Error("Reference replacement requires a new idea");
  const id = existing?.id ?? randomUUID();
  const directory = folder(id, profile);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lock = path.join(directory, ".lock");
  let fd: number;
  try { fd = fs.openSync(lock, "wx", 0o600); }
  catch { throw Object.assign(new Error("This idea is being saved. Try again."), { status: 409 }); }
  try {
    const old = existing ? readVideoIdea(id, profile) : null;
    if (old && old.revision !== existing!.expected_revision) throw Object.assign(new Error("This idea changed elsewhere. Reload before saving; your draft is still here."), { status: 409 });
    const copy = (source: string | undefined, file: "reference.mp4" | "poster.jpg") => {
      if (!source) return null;
      const bytes = fs.readFileSync(source);
      fs.writeFileSync(path.join(directory, file), bytes, { flag: "wx", mode: 0o600 });
      return { file, sha256: createHash("sha256").update(bytes).digest("hex") };
    };
    const now = new Date().toISOString();
    const idea = videoIdeaSchema.parse({ ...parsed, schema_version: 1, id, revision: (old?.revision ?? 0) + 1,
      created_at: old?.created_at ?? now, updated_at: now,
      reference: old?.reference ?? copy(media?.reference, "reference.mp4"), poster: old?.poster ?? copy(media?.poster, "poster.jpg") });
    writeJsonFileAtomic(path.join(directory, "idea.json"), idea);
    return idea;
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
export function resolveVideoIdeaMedia(id: string, kind: "reference" | "poster", profile = profileDir()) {
  try {
    const item = readVideoIdea(id, profile)[kind];
    if (!item) return null;
    const directory = fs.realpathSync(folder(id, profile));
    const file = fs.realpathSync(path.join(directory, item.file));
    if (!file.startsWith(directory + path.sep) || !fs.statSync(file).isFile()) return null;
    if (createHash("sha256").update(fs.readFileSync(file)).digest("hex") !== item.sha256) return null;
    return { file, contentType: kind === "reference" ? "video/mp4" : "image/jpeg" };
  } catch { return null; }
}
