import { z } from "zod";
import type { StoryboardContent } from "./model";

export const scriptPassageSchema = z.object({
  id: z.string().uuid(), title: z.string().trim().min(1).max(240), text: z.string().max(20000),
}).passthrough();
export type ScriptPassage = z.infer<typeof scriptPassageSchema>;

/** Script identity is independent of shots, sources and timing. */
export function saveScriptPassage(board: StoryboardContent, passage: ScriptPassage, expected?: ScriptPassage): StoryboardContent {
  const script = board.script ?? [], current = script.find(p => p.id === passage.id);
  if (expected ? !current || current.title !== expected.title || current.text !== expected.text : current) {
    throw new Error("This passage changed. Cancel to read the latest version before saving.");
  }
  const next = scriptPassageSchema.parse(passage);
  if (current && current.title === next.title && current.text === next.text) return board;
  return { ...board, script: current ? script.map(p => p.id === next.id ? { ...p, ...next } : p) : [...script, next] };
}
export function moveScriptPassage(board: StoryboardContent, id: string, delta: -1 | 1): StoryboardContent {
  const script = [...(board.script ?? [])], i = script.findIndex(p => p.id === id), j = i + delta;
  if (i < 0 || j < 0 || j >= script.length) return board;
  [script[i], script[j]] = [script[j], script[i]];
  return { ...board, script };
}

export const scriptRangeSchema = z.object({
  id: z.string().uuid(), label: z.string().trim().min(1).max(240),
  start: z.number().int().nonnegative(), end: z.number().int().nonnegative(),
  quote: z.string().max(100000), needsReview: z.boolean().optional(),
  /** Visuals planned for this section: storyboard source paths, in the order they were linked. */
  visuals: z.array(z.string().min(1)).max(50).optional(),
}).passthrough();
export const scriptDocumentSchema = z.object({
  enabled: z.boolean(), markdown: z.string().max(100000), marks: z.array(scriptRangeSchema).max(500),
}).passthrough().superRefine((doc, ctx) => {
  if (new Set(doc.marks.map(m => m.id)).size !== doc.marks.length) ctx.addIssue({ code: "custom", message: "Duplicate script mark" });
  for (const mark of doc.marks) {
    if (mark.end < mark.start || mark.end > doc.markdown.length || (!mark.needsReview && (mark.start === mark.end || doc.markdown.slice(mark.start, mark.end) !== mark.quote))) {
      ctx.addIssue({ code: "custom", message: "Script mark no longer matches its text" });
    }
  }
});
export type ScriptDocument = z.infer<typeof scriptDocumentSchema>;
export type ScriptRange = z.infer<typeof scriptRangeSchema>;

/** Legacy passages are presented as a single document; reads never migrate the file. */
export function readScriptDocument(board: StoryboardContent): ScriptDocument {
  if (board.scriptDocument) return board.scriptDocument;
  let markdown = "";
  const marks: ScriptRange[] = [];
  for (const passage of board.script ?? []) {
    markdown += `${markdown ? "\n\n" : ""}## ${passage.title}\n\n`;
    const start = markdown.length;
    markdown += passage.text;
    if (passage.text) marks.push({ id: passage.id, label: passage.title, start, end: markdown.length, quote: passage.text });
  }
  return { enabled: !!board.script?.length, markdown, marks };
}
export function saveScriptDocument(board: StoryboardContent, next: ScriptDocument, expected: ScriptDocument): StoryboardContent {
  if (JSON.stringify(readScriptDocument(board)) !== JSON.stringify(expected)) throw new Error("The script changed elsewhere. Cancel your draft to load the latest version.");
  const parsed = scriptDocumentSchema.parse(next);
  return JSON.stringify(parsed) === JSON.stringify(expected) ? board : { ...board, scriptDocument: parsed };
}

/** UTF-16 offsets match textarea selectionStart/End. Untouched marks shift; edited marks request review. */
export function editScriptText(doc: ScriptDocument, markdown: string): ScriptDocument {
  if (markdown === doc.markdown) return doc;
  const old = doc.markdown;
  let start = 0, end = old.length, nextEnd = markdown.length;
  while (start < end && start < nextEnd && old[start] === markdown[start]) start++;
  while (end > start && nextEnd > start && old[end - 1] === markdown[nextEnd - 1]) { end--; nextEnd--; }
  const delta = nextEnd - end;
  return { ...doc, markdown, marks: doc.marks.map(mark => {
    if (mark.end <= start) return mark;
    if (mark.start >= end) return { ...mark, start: mark.start + delta, end: mark.end + delta };
    return { ...mark, start: Math.min(mark.start, start), end: Math.max(Math.min(mark.start, start), mark.end >= end ? mark.end + delta : nextEnd), needsReview: true };
  }) };
}
export function markScriptRange(doc: ScriptDocument, mark: Pick<ScriptRange, "id" | "label" | "start" | "end">): ScriptDocument {
  if (mark.start < 0 || mark.end <= mark.start || mark.end > doc.markdown.length || !doc.markdown.slice(mark.start, mark.end).trim()) throw new Error("Select the words you want to mark first.");
  return scriptDocumentSchema.parse({ ...doc, marks: [...doc.marks.filter(m => m.id !== mark.id), { ...doc.marks.find(m => m.id === mark.id), ...mark, needsReview: false, quote: doc.markdown.slice(mark.start, mark.end) }].sort((a, b) => a.start - b.start || a.end - b.end) });
}

/**
 * Agent script write: text the creator asked for ("transcribe this and put it in the script") becomes
 * the Script document. Blocks join as paragraphs; a block with a section name is also marked. Saved
 * through the ordinary storyboard save, so it is one revision-checked Undo step for the creator.
 */
export const storyboardScriptWriteSchema = z.object({
  revision: z.number().int().nonnegative().describe("Storyboard revision from storyboard_get; a changed board is refused rather than overwritten"),
  mode: z.enum(["append", "replace"]).default("append").describe("append (default): add after the existing script, or fill an empty one. replace: these blocks become the whole script and its sections; only when the creator asks to replace it"),
  blocks: z.array(z.object({
    text: z.string().trim().min(1).max(20000).describe("A paragraph or passage of script text, e.g. one spoken point from a transcript. Plain text or Markdown"),
    section: z.string().trim().min(1).max(240).optional().describe("Name to mark this block as a script section, e.g. 'Opening scoreboard'. Omit to add it as plain text"),
  }).strict()).min(1).max(500),
}).strict();
export type StoryboardScriptWrite = z.infer<typeof storyboardScriptWriteSchema>;

/** Pure: the board after an agent script write. `id` supplies fresh UUIDs for marked sections. */
export function applyScriptWrite(board: StoryboardContent, write: StoryboardScriptWrite, id: () => string = () => crypto.randomUUID()): StoryboardContent {
  const current = readScriptDocument(board), keep = write.mode === "append";
  // Existing text and its marks stay byte-for-byte; new blocks start after a blank line.
  let markdown = keep ? current.markdown : "";
  const marks: ScriptRange[] = keep ? [...current.marks] : [];
  for (const block of write.blocks) {
    if (markdown.trim()) markdown += markdown.endsWith("\n\n") ? "" : markdown.endsWith("\n") ? "\n" : "\n\n";
    const start = markdown.length;
    markdown += block.text;
    if (block.section) marks.push({ id: id(), label: block.section, start, end: markdown.length, quote: block.text });
  }
  const parsed = scriptDocumentSchema.safeParse({ ...current, enabled: true, markdown, marks });
  if (!parsed.success) throw new Error(markdown.length > 100000 ? `The script would be ${markdown.length} characters; it holds at most 100000.` : parsed.error.issues[0]?.message ?? "Invalid script");
  return { ...board, scriptDocument: parsed.data };
}

/** A section to link: an existing mark, or a highlighted range that becomes a section. */
export type ScriptTarget = { id: string } | { start: number; end: number; label?: string };

/** Link visuals to sections (adding, never duplicating); unmarked ranges become named sections first. */
export function linkScriptVisuals(doc: ScriptDocument, targets: ScriptTarget[], sources: string[], replace = false, id: () => string = () => crypto.randomUUID()): ScriptDocument {
  let next = doc;
  for (const target of targets) {
    let mark = "id" in target ? next.marks.find(m => m.id === target.id) : next.marks.find(m => m.start === target.start && m.end === target.end);
    if (!mark) {
      if ("id" in target) throw new Error("That script section no longer exists. Read the script again.");
      const markId = id();
      next = markScriptRange(next, { id: markId, label: target.label?.trim() || next.markdown.slice(target.start, target.end).trim().slice(0, 60), start: target.start, end: target.end });
      mark = next.marks.find(m => m.id === markId)!;
    }
    const visuals = [...new Set([...(replace ? [] : mark.visuals ?? []), ...sources])];
    next = { ...next, marks: next.marks.map(m => m.id === mark!.id ? { ...m, visuals } : m) };
  }
  return scriptDocumentSchema.parse(next);
}
export function unlinkScriptVisual(doc: ScriptDocument, markId: string, source: string): ScriptDocument {
  return { ...doc, marks: doc.marks.map(m => m.id === markId ? { ...m, visuals: (m.visuals ?? []).filter(v => v !== source) } : m) };
}

/**
 * Agent links between script sections and visuals ("put these screenshots on the Thursday part"). Each link
 * names an existing section by id, or a highlighted range by character offsets plus its exact text, which
 * becomes a section. One revision-checked storyboard Undo step; no shots or timeline change.
 */
export const storyboardScriptLinkSchema = z.object({
  revision: z.number().int().nonnegative().describe("Storyboard revision from storyboard_get; a changed board is refused rather than overwritten"),
  links: z.array(z.object({
    section_id: z.string().uuid().optional().describe("An existing section's id from storyboard_get script.sections[].id or a selected item's agent_text"),
    start: z.number().int().nonnegative().optional().describe("For text that is not a section yet: start character offset in script.text (from the selected item's agent_text)"),
    end: z.number().int().nonnegative().optional().describe("End character offset (exclusive) in script.text"),
    quote: z.string().max(100000).optional().describe("The exact script text from start to end; the link is refused if the script changed"),
    label: z.string().trim().min(1).max(240).optional().describe("Name for a new section made from start/end, e.g. 'Thursday sell-off'. Defaults to its first words"),
    visuals: z.array(z.string().min(1)).min(1).max(50).describe("Photo or video source paths (storyboard_get sources[].source) shown during this section"),
    replace: z.boolean().default(false).describe("true: these visuals replace the section's linked visuals. false (default): add to them"),
  }).strict()).min(1).max(100),
}).strict();
export type StoryboardScriptLink = z.infer<typeof storyboardScriptLinkSchema>;

/** Pure: the board after agent links. Linked visuals join Storyboard Media if they are not there yet. */
export function applyScriptLinks(board: StoryboardContent, write: StoryboardScriptLink, assets: { source: string; kind: string }[], id: () => string = () => crypto.randomUUID()): StoryboardContent {
  let doc = readScriptDocument(board);
  write.links.forEach((link, i) => {
    const where = `Link ${i + 1}`;
    for (const source of link.visuals) {
      const asset = assets.find(a => a.source === source);
      if (!asset) throw new Error(`${where}: unknown source ${source}. Use a source from storyboard_get.`);
      if (asset.kind === "audio") throw new Error(`${where}: ${source} is audio; link photos or videos.`);
    }
    let target: ScriptTarget;
    if (link.section_id) target = { id: link.section_id };
    else {
      if (link.start === undefined || link.end === undefined || link.quote === undefined) throw new Error(`${where}: give section_id, or start, end and quote for new text.`);
      if (doc.markdown.slice(link.start, link.end) !== link.quote) throw new Error(`${where}: the script text at ${link.start}–${link.end} changed. Read the script again.`);
      target = { start: link.start, end: link.end, label: link.label };
    }
    try { doc = linkScriptVisuals(doc, [target], link.visuals, link.replace, id); }
    catch (error) { throw new Error(`${where}: ${error instanceof Error ? error.message : "cannot link"}`); }
  });
  const sources = [...new Set([...board.sources, ...write.links.flatMap(l => l.visuals)])];
  return { ...board, sources, scriptDocument: { ...doc, enabled: true } };
}
