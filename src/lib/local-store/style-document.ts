import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { writeJsonFileAtomic } from "./atomic-json";
import type { EditingPreference } from "./editing-memory";

export const styleHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const personalActive = (p: EditingPreference) => p.status === "active" && p.scope !== "project";
const categories = { "Overall direction": "Workflow", "Pacing and storytelling": "Pacing", "Text and captions": "Captions", "Visuals and transitions": "Visuals", "Music and sound": "Audio", "Delivery": "Delivery", "How I like to work": "Workflow" } as const;

/** Cross-process serialization of profile and document writes. Never steal a live lock. */
export function withStyleLock<T>(directory: string, run: () => T): T {
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, ".style-write.lock");
  if (fs.existsSync(file)) {
    const pid = Number(fs.readFileSync(file, "utf8"));
    try { process.kill(pid, 0); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") fs.unlinkSync(file);
    }
  }
  let fd: number;
  try { fd = fs.openSync(file, "wx", 0o600); }
  catch { throw new Error("My style is being saved elsewhere. Please retry."); }
  try { fs.writeFileSync(fd, String(process.pid)); return run(); }
  finally { fs.closeSync(fd); fs.unlinkSync(file); }
}

export function writeStyleText(directory: string, text: string) {
  const temp = path.join(directory, `.STYLE-${randomUUID()}.tmp`);
  const fd = fs.openSync(temp, "wx", 0o600);
  try { fs.writeFileSync(fd, text); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  try {
    fs.renameSync(temp, path.join(directory, "STYLE.md"));
    if (process.platform !== "win32") {
      const parent = fs.openSync(directory, "r");
      try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
    }
  }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}

export function initialStyle(preferences: EditingPreference[]) {
  let text = "# My style\n";
  for (const scope of ["all", "vertical-social"] as const) {
    const rows = preferences.filter(p => personalActive(p) && p.scope === scope);
    if (scope === "vertical-social") {
      if (!rows.length) continue;
      text += "\n## Vertical videos\n";
    }
    for (const [heading, category] of Object.entries(categories)) {
      if (heading === "Overall direction") { if (scope === "all") text += "\n## Overall direction\n"; continue; }
      const items = rows.filter(p => p.category === category);
      text += `\n${scope === "all" ? "##" : "###"} ${heading}\n`;
      for (const item of items) text += `\n${item.text}\n`;
    }
  }
  return text;
}

/** Must be called under the profile lock. Preserve the legacy source and projection. */
export function ensureStyleDocument(directory: string, preferences: EditingPreference[]) {
  const file = path.join(directory, "STYLE.md");
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  const backup = path.join(directory, "style-history", "migration.json");
  if (current === null && fs.existsSync(backup)) throw new Error("STYLE.md is missing. Restore your document from style-history before editing preferences.");
  if (!fs.existsSync(backup)) writeJsonFileAtomic(backup, { created_at: new Date().toISOString(), markdown: current, preferences });
  if (current === null || /^<!-- (?:dreamcut|openedit|opensequence)-style-projection:v1 -->/.test(current)) {
    writeStyleText(directory, initialStyle(preferences));
  }
  const markdown = fs.readFileSync(file, "utf8");
  rememberStyle(directory, markdown);
  return { markdown, revision: styleHash(markdown) };
}

export function rememberStyle(directory: string, markdown: string) {
  const revision = styleHash(markdown);
  const file = path.join(directory, "style-history", `${revision}.json`);
  if (!fs.existsSync(file)) writeJsonFileAtomic(file, { revision, markdown, stored_at: new Date().toISOString() });
}

export type StyleBlock = { start: number; end: number; preference: EditingPreference };
/** Paragraphs retain arbitrary Markdown. The explicitly named Vertical videos section
 * scopes itself and its children; a following peer heading returns to all edits. */
export function styleBlocks(markdown: string, previous: EditingPreference[]): StyleBlock[] {
  const blocks: StyleBlock[] = [];
  let scope: EditingPreference["scope"] = "all", verticalLevel = 0;
  let category: EditingPreference["category"] = "Workflow";
  let heading = "", offset = 0, start = -1, content = "", fence = false;
  const flush = () => {
    if (start < 0 || !content.trim()) { start = -1; content = ""; return; }
    const rawText = content.trim();
    const knownHeading = heading in categories || ["My style", "Vertical videos", "All edits", "Pacing", "Captions", "Visuals", "Audio", "Workflow"].includes(heading);
    const text = heading && !knownHeading ? `${heading}:\n${rawText}` : rawText;
    const old = previous.find(p => p.scope === scope && p.text === text && p.category === category);
    const hash = styleHash(`${scope}:${category}:${heading}:${text}:${blocks.length}`);
    blocks.push({ start, end: offset, preference: { id: old?.id ?? `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`, text, scope, category, status: "active", origin: old?.origin ?? "human", evidence: old?.evidence ?? [], updated_at: old?.updated_at ?? new Date().toISOString(), ...(old?.reasoning ? {reasoning:old.reasoning} : {}) } });
    start = -1; content = "";
  };
  for (const line of markdown.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const match = !fence && /^(#{1,6})\s+(.+?)\s*\n?$/.exec(line);
    if (match) {
      flush();
      const level = match[1]!.length;
      heading = match[2]!;
      if (verticalLevel && level <= verticalLevel) { scope = "all"; verticalLevel = 0; }
      if (heading.toLowerCase() === "vertical videos") { scope = "vertical-social"; verticalLevel = level; }
      category = categories[heading as keyof typeof categories] ?? (["Pacing","Captions","Visuals","Audio","Delivery","Workflow"].includes(heading) ? heading as EditingPreference["category"] : "Workflow");
    } else if (!fence && !line.trim()) { flush(); }
    else {
      if (start < 0) start = offset;
      content += line;
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    }
    offset += line.length;
  }
  flush();
  return blocks;
}

export function derivedStyle(markdown: string, preferences: EditingPreference[]) {
  const active = styleBlocks(markdown, preferences).map(b => b.preference);
  return [...preferences.filter(p => !personalActive(p) && !active.some(item => item.id === p.id)), ...active];
}

/** Compatibility for existing preference commands: apply only their delta; preserve
 * hand-authored Markdown and fail upstream if the read revision became stale. */
export function updateStyleFromPreferences(markdown: string, before: EditingPreference[], after: EditingPreference[]) {
  let result = markdown;
  const next = after.filter(personalActive);
  for (const block of styleBlocks(markdown, before).reverse()) {
    const replacement = next.find(p => p.id === block.preference.id);
    if (!replacement || JSON.stringify([replacement.text,replacement.scope,replacement.category]) !== JSON.stringify([block.preference.text,block.preference.scope,block.preference.category])) {
      result = result.slice(0, block.start) + result.slice(block.end);
    }
  }
  for (const item of next) {
    if (before.some(p => personalActive(p) && p.id === item.id && p.text === item.text && p.scope === item.scope && p.category === item.category)) continue;
    const heading = Object.entries(categories).find(([name, value]) => value === item.category && name !== "Overall direction")?.[0] ?? "Overall direction";
    result += `\n## ${item.scope === "vertical-social" ? "Vertical videos\n\n### " + heading : heading}\n\n${item.text}\n`;
  }
  return result;
}
