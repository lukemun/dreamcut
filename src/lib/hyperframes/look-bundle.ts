import fs from "node:fs";
import path from "node:path";

/**
 * Motion-graphic looks are supplied by DreamCut, not by the composition source. A composition made
 * from a template that works with looks (looks.json's `works_with`), or one whose controls file sets
 * `"looks": true`, loads `looks.js`, and DreamCut
 * writes that file into the copy it checks, previews or renders: the shared runtime, the scene
 * drawing kit and only the look the graphic uses. The source never stores it, so a look change
 * re-renders without changing the source, and agents never send the look code.
 */
export const LOOKS_FILE = "looks.js";
const LOOKS_DIR = ".agents/skills/motion-graphics/looks";
const FALLBACK_LOOK = "paper";
const LOOK_ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;

export function looksDirectory(root = process.cwd()): string {
  return path.join(root, LOOKS_DIR);
}

/** The templates whose compositions load DreamCut's looks. */
export function sharedLooksTemplates(root = process.cwd()): string[] {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(looksDirectory(root), "looks.json"), "utf8")) as { works_with?: unknown };
    return Array.isArray(manifest.works_with) ? manifest.works_with.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** Templates no longer offered whose graphics already in projects still load looks, so they keep rendering. */
const RETIRED_LOOK_TEMPLATES = ["kinetic-type"];

export function usesSharedLooks(manifest: { template?: string; looks?: boolean } | null | undefined, root = process.cwd()): boolean {
  if (manifest?.looks === true) return true;
  const template = manifest?.template;
  return Boolean(template && (sharedLooksTemplates(root).includes(template) || RETIRED_LOOK_TEMPLATES.includes(template)));
}

/** True when a controls file's text declares a template that works with looks. */
export function controlsTextUsesSharedLooks(text: string, root = process.cwd()): boolean {
  try {
    return usesSharedLooks(JSON.parse(text) as { template?: string; looks?: boolean }, root);
  } catch {
    return false;
  }
}

/** The look a set of control values asks for, or the fallback when it names none. */
export function lookIdFromValues(values: Record<string, unknown> | null | undefined): string {
  const look = values?.look;
  return typeof look === "string" && LOOK_ID_RE.test(look) ? look : FALLBACK_LOOK;
}

const BASE_LOOK_RE = /DreamcutMotion\.LOOKS(?:\.([a-z0-9_]+)|\[["']([a-z0-9-]+)["']\])/g;

/** A look and the looks it builds on (read as `DreamcutMotion.LOOKS.<id>`), bases first. */
function lookChain(dir: string, id: string, seen = new Set<string>()): string[] {
  if (seen.has(id)) return [];
  seen.add(id);
  const source = fs.readFileSync(path.join(dir, `${id}.js`), "utf8");
  const bases = [...source.matchAll(BASE_LOOK_RE)].map((m) => m[1] ?? m[2]).filter((base) => base !== id && fs.existsSync(path.join(dir, `${base}.js`)));
  return [...bases.flatMap((base) => lookChain(dir, base, seen)), id];
}

/** The runtime, the drawing kit and one look with any looks it builds on; a look with no file falls back to Paper. */
export function buildLookBundle(lookId: string, root = process.cwd()): string {
  const dir = looksDirectory(root);
  const id = LOOK_ID_RE.test(lookId) && fs.existsSync(path.join(dir, `${lookId}.js`)) ? lookId : FALLBACK_LOOK;
  const parts = [
    `// Supplied by DreamCut for this graphic: the look runtime, the drawing kit and the "${id}" look.`,
    fs.readFileSync(path.join(dir, "runtime.js"), "utf8").trimEnd(),
    fs.readFileSync(path.join(dir, "kit.js"), "utf8").trimEnd(),
    ...lookChain(dir, id).map((look) => fs.readFileSync(path.join(dir, `${look}.js`), "utf8").trimEnd()),
  ];
  return parts.join("\n\n") + "\n";
}

/** Write the bundle for a look into a composition copy (never into the project's source). */
export function writeLookBundle(directory: string, lookId: string, root = process.cwd()): void {
  fs.writeFileSync(path.join(directory, LOOKS_FILE), buildLookBundle(lookId, root));
}
