/** Save a prepared personal reference without creating or editing a project. */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { listVideoIdeas, saveVideoIdea } from "../src/lib/local-store/video-ideas";
import { videoIdeaInputSchema } from "../src/lib/video-ideas";

const { values } = parseArgs({ options: { input: { type: "string" }, reference: { type: "string" }, poster: { type: "string" } } });
if (!values.input) throw new Error("Usage: pnpm exec tsx scripts/import-video-idea.ts --input idea-input.json [--reference video.mp4] [--poster image.jpg]");
const input = videoIdeaInputSchema.parse(JSON.parse(fs.readFileSync(path.resolve(values.input), "utf8")));
const reference = values.reference ? path.resolve(values.reference) : undefined;
const hash = reference ? createHash("sha256").update(fs.readFileSync(reference)).digest("hex") : undefined;
const duplicate = listVideoIdeas().ideas.find(idea => hash ? idea.reference?.sha256 === hash : input.source_url && idea.source_url === input.source_url);
if (duplicate) console.log(JSON.stringify({ reused: true, id: duplicate.id, title: duplicate.title }));
else {
  const idea = saveVideoIdea(input, undefined, undefined, { reference, poster: values.poster ? path.resolve(values.poster) : undefined });
  console.log(JSON.stringify({ id: idea.id, title: idea.title }));
}
