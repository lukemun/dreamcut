import fs from "node:fs";
import path from "node:path";

import { looksDirectory } from "./look-bundle";
import type { CompositionManifest, ManifestControl, ManifestValues } from "./composition-manifest";

/**
 * The piece types a split looks template is laid out in (looks/pieces.json), and which looks draw
 * each one. A split composition's `layer` names one piece: a section (`stage`, the world with its
 * backdrop and lighting; `front`, light over every scene), a whole scene (`title`) or one piece of a
 * scene (`title-card`, `people-person-2`, `closing-chip-play`). Each piece picks its own look from
 * the looks that declare its type in their manifest's `pieces`; every look draws a `stage`.
 */
export type PieceType = { id: string; label: string; kind: "section" | "scene" | "piece"; scene?: string };

type Registry = {
  template: string;
  sections: Record<string, { label: string }>;
  scenes: Record<string, { label: string; pieces: Record<string, string> }>;
};

const PIECES_FILE = "pieces.json";
const LOOK_PROP = "look";
const LAYER_PROP = "layer";
const WHOLE = "all";

// The registry and look manifests are read on every poll that lists a split piece's controls, once
// per piece. They are parsed once and reused until a manifest file changes; the file check itself
// runs at most once a second.
const RECHECK_MS = 1000;
type Memo = { root: string; signature: string; checkedAt: number; registry: Registry | null; types: Map<string, PieceType>; looks: LookEntry[]; byType: Map<string, Array<{ id: string; title: string }>> };
let memo: Memo | null = null;

function manifestSignature(dir: string): string {
  try {
    return fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort().map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      return `${name}:${stat.size}:${stat.mtimeMs}`;
    }).join("|");
  } catch {
    return "";
  }
}

function load(root: string): Memo {
  const now = Date.now();
  if (memo && memo.root === root && now - memo.checkedAt < RECHECK_MS) return memo;
  const dir = looksDirectory(root);
  const signature = manifestSignature(dir);
  if (memo && memo.root === root && memo.signature === signature) {
    memo.checkedAt = now;
    return memo;
  }
  let registry: Registry | null = null;
  try {
    registry = JSON.parse(fs.readFileSync(path.join(dir, PIECES_FILE), "utf8")) as Registry;
  } catch { /* no registry: nothing splits into pieces */ }
  const types = buildTypes(registry);
  const looks = readLookEntries(dir);
  const byType = new Map<string, Array<{ id: string; title: string }>>();
  for (const look of looks) for (const type of look.pieces) {
    const list = byType.get(type) ?? [];
    list.push({ id: look.id, title: look.title });
    byType.set(type, list);
  }
  memo = { root, signature, checkedAt: now, registry, types, looks, byType };
  return memo;
}

function readRegistry(root: string): Registry | null {
  return load(root).registry;
}

/** Every piece type of the registry, keyed by id (`#` numbers a type, `*` names one). */
export function pieceTypes(root = process.cwd()): Map<string, PieceType> {
  return load(root).types;
}

function buildTypes(registry: Registry | null): Map<string, PieceType> {
  const out = new Map<string, PieceType>();
  if (!registry) return out;
  for (const [id, section] of Object.entries(registry.sections)) out.set(id, { id, label: section.label, kind: "section" });
  for (const [scene, entry] of Object.entries(registry.scenes)) {
    out.set(scene, { id: scene, label: entry.label, kind: "scene" });
    for (const [piece, label] of Object.entries(entry.pieces)) out.set(`${scene}-${piece}`, { id: `${scene}-${piece}`, label: `${entry.label} ${label.toLowerCase()}`, kind: "piece", scene });
  }
  return out;
}

/** The template the registry lays out. */
export function pieceTemplate(root = process.cwd()): string | null {
  return readRegistry(root)?.template ?? null;
}

/** The type a layer name belongs to: `people-person-2` is `people-person#`, `closing-chip-play` is `closing-chip-*`. */
export function pieceTypeOf(layer: string, root = process.cwd()): PieceType | null {
  const types = pieceTypes(root);
  const exact = types.get(layer);
  if (exact) return exact;
  const numbered = layer.match(/^(.+)-(\d+)$/);
  if (numbered && types.get(`${numbered[1]}#`)) return types.get(`${numbered[1]}#`)!;
  for (const [id, type] of types) if (id.endsWith("-*") && layer.startsWith(id.slice(0, -1)) && layer.length > id.length - 1) return type;
  return null;
}

type LookEntry = { id: string; title: string; pieces: Set<string> };

function lookEntries(root: string): LookEntry[] {
  return load(root).looks;
}

function readLookEntries(dir: string): LookEntry[] {
  let order: string[] = [];
  try {
    order = (JSON.parse(fs.readFileSync(path.join(dir, "looks.json"), "utf8")) as { order?: string[] }).order ?? [];
  } catch {
    return [];
  }
  return order.flatMap((id) => {
    try {
      const look = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), "utf8")) as { title?: string; pieces?: unknown };
      const pieces = new Set(Array.isArray(look.pieces) ? look.pieces.filter((piece): piece is string => typeof piece === "string") : []);
      pieces.add("stage");
      return [{ id, title: look.title ?? id, pieces }];
    } catch {
      return [];
    }
  });
}

/** The looks that draw a piece type, in catalog order. */
export function looksWithPiece(typeId: string, root = process.cwd()): Array<{ id: string; title: string }> {
  return load(root).byType.get(typeId) ?? [];
}

/** True when a manifest belongs to the template the registry lays out. */
function splitsIntoPieces(manifest: Pick<CompositionManifest, "template"> | null | undefined, root: string): boolean {
  return Boolean(manifest?.template && manifest.template === pieceTemplate(root));
}

/**
 * Why a split piece cannot be drawn in its look, or null when it can (or the graphic is whole).
 * The refusal names the piece and the looks that do draw it.
 */
export function pieceLookProblem(manifest: Pick<CompositionManifest, "template"> | null | undefined, values: ManifestValues | null | undefined, root = process.cwd()): string | null {
  if (!splitsIntoPieces(manifest, root) || !values) return null;
  const layer = typeof values[LAYER_PROP] === "string" ? String(values[LAYER_PROP]) : WHOLE;
  if (layer === WHOLE) return null;
  const type = pieceTypeOf(layer, root);
  if (!type) return `"${layer}" is not a piece of this template. Pieces are listed in looks/${PIECES_FILE}.`;
  const look = typeof values[LOOK_PROP] === "string" ? String(values[LOOK_PROP]) : "";
  const able = looksWithPiece(type.id, root);
  if (able.some((entry) => entry.id === look)) return null;
  const title = lookEntries(root).find((entry) => entry.id === look)?.title ?? look;
  const names = able.map((entry) => entry.title);
  return `${title} has no ${type.label.toLowerCase()} piece. ${names.length ? `Looks with one: ${names.join(", ")}.` : "No look draws it yet."}`;
}

/**
 * The controls a split piece offers: its Look choice lists only the looks that draw the piece. With
 * fewer than two, the look stays as rendered and is not offered as a choice.
 */
export function pieceControls(manifest: CompositionManifest, values: ManifestValues | null | undefined, root = process.cwd()): ManifestControl[] {
  if (!splitsIntoPieces(manifest, root) || !values) return manifest.controls;
  const layer = typeof values[LAYER_PROP] === "string" ? String(values[LAYER_PROP]) : WHOLE;
  const type = layer === WHOLE ? null : pieceTypeOf(layer, root);
  if (!type) return manifest.controls;
  const able = new Set(looksWithPiece(type.id, root).map((entry) => entry.id));
  return manifest.controls.map((control) => {
    if (control.id !== LOOK_PROP || control.kind !== "choice") return control;
    const options = control.options.filter((option) => able.has(option.value));
    return options.length >= 2 ? { ...control, options } : { ...control, fixed: true as const };
  });
}
