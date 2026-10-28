import { createHash } from "node:crypto";

import type { MotionAuditCoverage } from "@/lib/local-store/motion-audit";
import { parseTimingSpec, type CompositionTimingSpec } from "./composition-timing";

/**
 * Optional `dreamcut.controls.json` beside a model-authored composition or sound.
 * A missing manifest is valid: the composition is then one box with no inner controls.
 * See docs/architecture/model-authored-motion-graphics.md.
 */

export const MANIFEST_FILE_NAME = "dreamcut.controls.json";
export const RUNTIME_GLOBAL = "__dreamcut";

export type ManifestControl = ManifestControlKind & {
  /** Set once where the graphic is placed (which section it announces, how long it runs), so it
   * still renders from the manifest but is never offered as a dial on a card or in Properties. */
  fixed?: true;
  /** Another control (the look) whose change puts this one back to its default: a setting that
   * belongs to one look, not to the graphic's content. */
  resets_with?: string;
};

type ManifestControlKind =
  | { id: string; kind: "text"; label: string; default: string; max_length?: number }
  | { id: string; kind: "color"; label: string; default: string }
  | { id: string; kind: "number"; label: string; default: number; min: number; max: number; step?: number; unit?: string }
  /** An option's `label_from` names a text control whose current words label it (e.g. a section picked by its name). */
  | { id: string; kind: "choice"; label: string; default: string; options: Array<{ value: string; label: string; label_from?: string }> }
  | { id: string; kind: "switch"; label: string; default: boolean };

export type ManifestActor = { id: string; label: string };

export type ManifestMarker = {
  id: string;
  at_seconds: number;
  /** A hold: composition time from this marker to `until` may stretch within bounds. */
  stretch?: { min_seconds: number; max_seconds: number };
  until?: string;
};

/**
 * A canvas size chosen by one choice control (for example 16:9 or 9:16). The renderer reads
 * the root's `data-width`/`data-height` from the file before any script runs, so the render
 * copy carries the chosen size; the composition lays itself out from the same control.
 */
export type ManifestCanvas = {
  control: string;
  sizes: Record<string, { width: number; height: number }>;
};

export type CompositionManifest = {
  schema_version: 1;
  controls: ManifestControl[];
  actors: ManifestActor[];
  markers: ManifestMarker[];
  /** Declared length and cues as formulas over number controls (see composition-timing.ts). */
  timing?: CompositionTimingSpec;
  canvas?: ManifestCanvas;
  /** A switch control that, when on, fills the whole frame (a full-screen card with its own
   * backdrop), so a render with no transparent pixels is expected rather than a broken alpha encode. */
  opaque_control?: string;
  /** The one separable object this composition draws, and why a native timeline element cannot make its motion. */
  object?: ManifestObject;
  /** Packaged Template id, when the composition is one of the Templates under the motion-graphics skill. */
  template?: string;
  /** True when a composition that is not a packaged Template draws in DreamCut's shared looks (loads looks.js). */
  looks?: boolean;
};

export type ManifestObject = { label: string; native_gap: string };

/**
 * Recorded gap: packaged Templates that still draw several separable objects in one composition.
 * New compositions draw one object; each entry here is removed once its Template is split into
 * separate timeline elements.
 */
export const MULTI_OBJECT_TEMPLATE_GAPS: Readonly<Record<string, string>> = {
  "illustrated-explainer": "title, chart, illustrated object, people, process and comparison are drawn together",
  "explainer-sequence": "title, key point, count-up and steps are drawn together",
  "animated-chart": "bars, values and labels are drawn together",
  "plan-comparison": "plan cards, prices and ticks are drawn together",
  "walkthrough-steps": "numbers, step text and screenshots are drawn together",
  "word-search-trace": "the letter grid and outlines are drawn together",
};

/**
 * A packaged Template with a `layer` control can be laid out as separate timeline elements: "all"
 * draws the whole graphic, any other value one element of it (see the illustrated-explainer
 * template). Null when the composition has no such control.
 */
export const LAYER_CONTROL_ID = "layer";
export function templateLayer(manifest: CompositionManifest | null, values: ManifestValues | null): string | null {
  const control = manifest?.template ? manifest.controls.find((entry) => entry.id === LAYER_CONTROL_ID) : undefined;
  if (!control) return null;
  return String(values?.[LAYER_CONTROL_ID] ?? control.default);
}

/** Layers that are a look's world rather than an object: its full-frame backdrop and the atmosphere drawn over everything. */
const WORLD_LAYERS = new Set(["stage", "front"]);
/**
 * Templates whose scene splits into world layers of their own: a 3D sketch city is a ground plan,
 * a street network and many buildings, each one clip, drawn with the rest of the scene as depth so
 * the stacked clips match the whole. Any other layer of these Templates draws one object.
 */
const TEMPLATE_WORLD_LAYERS: Readonly<Record<string, ReadonlySet<string>>> = {
  "sketch-3d": new Set(["plan", "streets", "buildings"]),
};
export function isWorldLayer(manifest: CompositionManifest | null, values: ManifestValues | null): boolean {
  const layer = templateLayer(manifest, values);
  if (!layer || !manifest?.template) return false;
  if (TEMPLATE_WORLD_LAYERS[manifest.template]?.has(layer)) return true;
  return Boolean(MULTI_OBJECT_TEMPLATE_GAPS[manifest.template] && WORLD_LAYERS.has(layer));
}

/** The recorded multi-object gap when a packaged Template draws its whole graphic in one composition. */
export function wholeTemplateGap(manifest: CompositionManifest | null, values: ManifestValues | null): string | undefined {
  const gap = manifest?.template ? MULTI_OBJECT_TEMPLATE_GAPS[manifest.template] : undefined;
  if (!gap) return undefined;
  const layer = templateLayer(manifest, values);
  return layer === null || layer === "all" ? gap : undefined;
}

/**
 * A composition is one clip on the timeline, so it must draw one separable object and say
 * why a native element cannot make that object's motion. Checked for new or changed source;
 * the rendered frames are counted separately (composition-objects.ts). A Template split into
 * layers is held to this for every layer but "all".
 */
export function singleObjectProblems(manifest: CompositionManifest | null, values: ManifestValues | null = null): string[] {
  if (wholeTemplateGap(manifest, values)) return [];
  const problems: string[] = [];
  if (!manifest?.object) {
    problems.push(`A composition needs ${MANIFEST_FILE_NAME} with "object": {"label", "native_gap"} naming the one object it draws and why a native text, image or shape element cannot make its motion. Put logos, titles and words on native timeline elements.`);
  }
  if ((manifest?.actors.length ?? 0) > 1) {
    problems.push("A composition draws one object, so it declares at most one actor. Put each other actor on its own timeline element.");
  }
  return problems;
}

export type ManifestValues = Record<string, string | number | boolean>;

const ID_RE = /^[a-z][a-z0-9_]{0,47}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_CONTROLS = 64;

function fail(message: string): never {
  throw new Error(`Animation controls file: ${message}`);
}

function requireLabel(value: unknown, where: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 60) {
    fail(`${where} needs a short label`);
  }
  return value;
}

function parseControl(raw: unknown, index: number): ManifestControl {
  let parsed: ManifestControl = parseControlKind(raw, index);
  const { fixed, resets_with: resetsWith } = raw as Record<string, unknown>;
  if (resetsWith !== undefined) {
    if (typeof resetsWith !== "string" || !ID_RE.test(resetsWith) || resetsWith === parsed.id) fail(`control "${parsed.id}" resets_with must name another control`);
    parsed = { ...parsed, resets_with: resetsWith };
  }
  if (fixed === undefined || fixed === false) return parsed;
  if (fixed !== true) fail(`control "${parsed.id}" fixed must be true or false`);
  return { ...parsed, fixed: true };
}

function parseControlKind(raw: unknown, index: number): ManifestControlKind {
  if (!raw || typeof raw !== "object") fail(`control ${index + 1} must be an object`);
  const control = raw as Record<string, unknown>;
  const id = control.id;
  if (typeof id !== "string" || !ID_RE.test(id)) fail(`control ${index + 1} needs a snake_case id`);
  const label = requireLabel(control.label, `control "${id}"`);
  switch (control.kind) {
    case "text": {
      const maxLength = control.max_length;
      if (maxLength !== undefined && (!Number.isInteger(maxLength) || (maxLength as number) < 1 || (maxLength as number) > 500)) {
        fail(`control "${id}" max_length must be 1–500`);
      }
      if (typeof control.default !== "string") fail(`control "${id}" needs a text default`);
      if (maxLength !== undefined && control.default.length > (maxLength as number)) fail(`control "${id}" default is longer than max_length`);
      return { id, kind: "text", label, default: control.default, ...(maxLength !== undefined ? { max_length: maxLength as number } : {}) };
    }
    case "color": {
      if (typeof control.default !== "string" || !COLOR_RE.test(control.default)) fail(`control "${id}" default must be #rrggbb`);
      return { id, kind: "color", label, default: control.default.toLowerCase() };
    }
    case "number": {
      const { min, max, step, unit } = control;
      if (typeof min !== "number" || typeof max !== "number" || !Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
        fail(`control "${id}" needs finite min < max`);
      }
      if (typeof control.default !== "number" || control.default < min || control.default > max) {
        fail(`control "${id}" default must be within min and max`);
      }
      if (step !== undefined && (typeof step !== "number" || !(step > 0))) fail(`control "${id}" step must be positive`);
      if (unit !== undefined && (typeof unit !== "string" || unit.length > 12)) fail(`control "${id}" unit must be short text`);
      return {
        id, kind: "number", label, default: control.default, min, max,
        ...(step !== undefined ? { step: step as number } : {}),
        ...(unit !== undefined ? { unit: unit as string } : {}),
      };
    }
    case "choice": {
      const options = control.options;
      if (!Array.isArray(options) || options.length < 2 || options.length > 120) fail(`control "${id}" needs 2–120 options`);
      const parsed = options.map((option, optionIndex) => {
        const value = (option as { value?: unknown })?.value;
        if (typeof value !== "string" || value.length === 0) fail(`control "${id}" option ${optionIndex + 1} needs a value`);
        const labelFrom = (option as { label_from?: unknown }).label_from;
        if (labelFrom !== undefined && (typeof labelFrom !== "string" || !ID_RE.test(labelFrom))) fail(`control "${id}" option "${value}" label_from must name a control`);
        return { value, label: requireLabel((option as { label?: unknown }).label, `control "${id}" option "${value}"`),
          ...(labelFrom !== undefined ? { label_from: labelFrom as string } : {}) };
      });
      if (new Set(parsed.map((option) => option.value)).size !== parsed.length) fail(`control "${id}" has duplicate options`);
      if (typeof control.default !== "string" || !parsed.some((option) => option.value === control.default)) {
        fail(`control "${id}" default must be one of its options`);
      }
      return { id, kind: "choice", label, default: control.default, options: parsed };
    }
    case "switch": {
      if (typeof control.default !== "boolean") fail(`control "${id}" needs a true/false default`);
      return { id, kind: "switch", label, default: control.default };
    }
    default:
      return fail(`control "${id}" kind must be text, color, number, choice or switch`);
  }
}

function parseMarkers(raw: unknown): ManifestMarker[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) fail("markers must be a list");
  const markers = raw.map((value, index): ManifestMarker => {
    const marker = value as Record<string, unknown>;
    if (!marker || typeof marker !== "object") fail(`marker ${index + 1} must be an object`);
    if (typeof marker.id !== "string" || !ID_RE.test(marker.id)) fail(`marker ${index + 1} needs a snake_case id`);
    if (typeof marker.at_seconds !== "number" || !Number.isFinite(marker.at_seconds) || marker.at_seconds < 0) {
      fail(`marker "${marker.id}" needs at_seconds ≥ 0`);
    }
    const parsed: ManifestMarker = { id: marker.id, at_seconds: marker.at_seconds };
    if (marker.stretch !== undefined) {
      const stretch = marker.stretch as Record<string, unknown>;
      const min = stretch?.min_seconds;
      const max = stretch?.max_seconds;
      if (typeof min !== "number" || typeof max !== "number" || !(min >= 0) || !(max > min)) {
        fail(`marker "${marker.id}" stretch needs 0 ≤ min_seconds < max_seconds`);
      }
      if (typeof marker.until !== "string") fail(`marker "${marker.id}" stretch needs an until marker`);
      parsed.stretch = { min_seconds: min, max_seconds: max };
      parsed.until = marker.until;
    } else if (marker.until !== undefined) {
      fail(`marker "${marker.id}" until is only allowed on a stretchable hold`);
    }
    return parsed;
  });
  const byId = new Map(markers.map((marker) => [marker.id, marker]));
  if (byId.size !== markers.length) fail("marker ids must be unique");
  for (const marker of markers) {
    if (!marker.until) continue;
    const end = byId.get(marker.until);
    if (!end) fail(`marker "${marker.id}" until refers to unknown marker "${marker.until}"`);
    const authored = end.at_seconds - marker.at_seconds;
    if (!(authored > 0)) fail(`marker "${marker.id}" must come before "${end.id}"`);
    if (marker.stretch && (authored < marker.stretch.min_seconds || authored > marker.stretch.max_seconds)) {
      fail(`marker "${marker.id}" authored hold ${authored.toFixed(3)}s is outside its stretch range`);
    }
  }
  const holds = markers.filter((marker) => marker.stretch).sort((a, b) => a.at_seconds - b.at_seconds);
  for (let index = 1; index < holds.length; index += 1) {
    const previousEnd = byId.get(holds[index - 1]!.until!)!.at_seconds;
    if (holds[index]!.at_seconds < previousEnd) fail(`holds "${holds[index - 1]!.id}" and "${holds[index]!.id}" overlap`);
  }
  return markers;
}

export function parseCompositionManifest(raw: unknown): CompositionManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("must be a JSON object");
  const manifest = raw as Record<string, unknown>;
  if (manifest.schema_version !== 1) fail("schema_version must be 1");
  const rawControls = manifest.controls ?? [];
  if (!Array.isArray(rawControls) || rawControls.length > MAX_CONTROLS) fail(`controls must be a list of at most ${MAX_CONTROLS}`);
  const controls = rawControls.map(parseControl);
  const rawActors = manifest.actors ?? [];
  if (!Array.isArray(rawActors) || rawActors.length > MAX_CONTROLS) fail(`actors must be a list of at most ${MAX_CONTROLS}`);
  const actors = rawActors.map((value, index): ManifestActor => {
    const actor = value as Record<string, unknown>;
    if (!actor || typeof actor.id !== "string" || !ID_RE.test(actor.id)) fail(`actor ${index + 1} needs a snake_case id`);
    return { id: actor.id, label: requireLabel(actor.label, `actor "${actor.id}"`) };
  });
  const markers = parseMarkers(manifest.markers);
  for (const [name, ids] of [["control", controls.map((c) => c.id)], ["actor", actors.map((a) => a.id)]] as const) {
    if (new Set(ids).size !== ids.length) fail(`${name} ids must be unique`);
  }
  const controlIds = new Set(controls.map((control) => control.id));
  for (const control of controls) if (control.resets_with && !controlIds.has(control.resets_with)) fail(`control "${control.id}" resets_with must name a control`);
  const textIds = new Set(controls.filter((control) => control.kind === "text").map((control) => control.id));
  for (const control of controls) {
    if (control.kind !== "choice") continue;
    for (const option of control.options) {
      if (option.label_from && !textIds.has(option.label_from)) fail(`control "${control.id}" option "${option.value}" label_from must name a text control`);
    }
  }
  const numbers = Object.fromEntries(controls.flatMap((control) => control.kind === "number" ? [[control.id, control.default]] : []));
  const timing = parseTimingSpec(manifest.timing, numbers);
  const canvas = parseCanvas(manifest.canvas, controls);
  const opaque = manifest.opaque_control;
  if (opaque !== undefined && !controls.some((control) => control.id === opaque && control.kind === "switch")) {
    fail("opaque_control must name a switch control");
  }
  const object = parseObject(manifest.object);
  const template = manifest.template;
  if (template !== undefined && (typeof template !== "string" || !/^[a-z0-9-]{1,64}$/.test(template))) fail("template must be a Template id");
  const looks = manifest.looks;
  if (looks !== undefined && typeof looks !== "boolean") fail("looks must be true or false");
  return {
    schema_version: 1, controls, actors, markers, ...(timing ? { timing } : {}), ...(canvas ? { canvas } : {}),
    ...(opaque !== undefined ? { opaque_control: opaque as string } : {}),
    ...(object ? { object } : {}), ...(template !== undefined ? { template: template as string } : {}),
    ...(looks ? { looks: true } : {}),
  };
}

function parseObject(raw: unknown): ManifestObject | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("object must be an object");
  const object = raw as Record<string, unknown>;
  const gap = object.native_gap;
  if (typeof gap !== "string" || gap.trim().length < 10 || gap.length > 200) {
    fail("object.native_gap must say in a sentence why a native element cannot make this motion");
  }
  return { label: requireLabel(object.label, "object"), native_gap: gap.trim() };
}

function parseCanvas(raw: unknown, controls: ManifestControl[]): ManifestCanvas | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("canvas must be an object");
  const canvas = raw as Record<string, unknown>;
  const control = controls.find((entry) => entry.id === canvas.control);
  if (!control || control.kind !== "choice") fail("canvas.control must name a choice control");
  const sizes = canvas.sizes as Record<string, unknown>;
  if (!sizes || typeof sizes !== "object" || Array.isArray(sizes)) fail("canvas.sizes must map each option to a size");
  const parsed: ManifestCanvas["sizes"] = {};
  for (const option of control.options) {
    const size = sizes[option.value] as Record<string, unknown> | undefined;
    const valid = (value: unknown) => Number.isInteger(value) && (value as number) >= 64 && (value as number) <= 4096 && (value as number) % 2 === 0;
    if (!size || !valid(size.width) || !valid(size.height)) fail(`canvas size for "${option.value}" needs even whole-pixel width and height (64–4096)`);
    parsed[option.value] = { width: size.width as number, height: size.height as number };
  }
  for (const key of Object.keys(sizes)) {
    if (!control.options.some((option) => option.value === key)) fail(`canvas size "${key}" is not an option of "${control.id}"`);
  }
  return { control: control.id, sizes: parsed };
}

/** The canvas size a value set chooses, or null when the manifest declares none. */
export function canvasSizeForValues(manifest: CompositionManifest, values: ManifestValues): { width: number; height: number } | null {
  if (!manifest.canvas) return null;
  return manifest.canvas.sizes[String(values[manifest.canvas.control])] ?? null;
}

/** True when this value set fills the frame on purpose, so an opaque render is not an alpha failure. */
export function rendersOpaque(manifest: CompositionManifest | null, values: ManifestValues | null): boolean {
  return Boolean(manifest?.opaque_control && values?.[manifest.opaque_control] === true);
}

/** Rewrite the composition root's data-width/data-height in the render copy. */
export function applyCanvasSizeToHtml(html: string, size: { width: number; height: number }): string {
  const root = /<[a-z][^>]*\bdata-composition-id\s*=\s*["'][^"']*["'][^>]*>/i.exec(html);
  if (!root) throw new Error("Animation with a canvas control needs a root element with data-composition-id");
  let tag = root[0];
  for (const [attribute, value] of [["data-width", size.width], ["data-height", size.height]] as const) {
    const pattern = new RegExp(`\\b${attribute}\\s*=\\s*["'][^"']*["']`, "i");
    tag = pattern.test(tag) ? tag.replace(pattern, `${attribute}="${value}"`) : tag.replace(/>$/, ` ${attribute}="${value}">`);
  }
  return `${html.slice(0, root.index)}${tag}${html.slice(root.index + root[0].length)}`;
}

/**
 * Rewrite the composition's length in the render copy. The renderer reads data-duration before
 * scripts run, so a declared timing.duration only takes effect when written into the file: when the
 * root has an authored length, it and every layer spanning that length get the new length; shorter
 * clips keep theirs.
 */
export function applyDurationToHtml(html: string, seconds: number): string {
  const root = /<[a-z][^>]*\bdata-composition-id\s*=\s*["'][^"']*["'][^>]*>/i.exec(html);
  if (!root) throw new Error("Animation with a timing duration needs a root element with data-composition-id");
  const authored = /\bdata-duration\s*=\s*["']([^"']*)["']/i.exec(root[0])?.[1];
  const value = String(Math.round(seconds * 1e4) / 1e4);
  // Compositions without an authored root length already size themselves; leave them untouched.
  if (authored === undefined) return html;
  const spansRoot = new RegExp(`\\bdata-duration\\s*=\\s*["']${authored.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "gi");
  return html.replace(spansRoot, `data-duration="${value}"`);
}

export function manifestSha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Canonical JSON (sorted keys) so equal value sets always hash equally. */
export function canonicalValuesJson(values: ManifestValues): string {
  return JSON.stringify(Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b))));
}

export function valuesSha256(values: ManifestValues): string {
  return createHash("sha256").update(canonicalValuesJson(values)).digest("hex");
}

/** Validate supplied values against the manifest and fill every omitted control with its default. */
export function resolveManifestValues(manifest: CompositionManifest, supplied: unknown): ManifestValues {
  if (supplied !== undefined && (supplied === null || typeof supplied !== "object" || Array.isArray(supplied))) {
    throw new Error("Animation values must be an object keyed by control id");
  }
  const input = (supplied ?? {}) as Record<string, unknown>;
  const known = new Set(manifest.controls.map((control) => control.id));
  for (const key of Object.keys(input)) {
    if (!known.has(key)) throw new Error(`Unknown animation control "${key}"`);
  }
  const values: ManifestValues = {};
  for (const control of manifest.controls) {
    const value = input[control.id] ?? control.default;
    switch (control.kind) {
      case "text":
        if (typeof value !== "string" || (control.max_length !== undefined && value.length > control.max_length)) {
          throw new Error(`"${control.label}" must be text${control.max_length ? ` up to ${control.max_length} characters` : ""}`);
        }
        break;
      case "color":
        if (typeof value !== "string" || !COLOR_RE.test(value)) throw new Error(`"${control.label}" must be a #rrggbb color`);
        break;
      case "number":
        if (typeof value !== "number" || !Number.isFinite(value) || value < control.min || value > control.max) {
          throw new Error(`"${control.label}" must be between ${control.min} and ${control.max}`);
        }
        break;
      case "choice":
        if (typeof value !== "string" || !control.options.some((option) => option.value === value)) {
          throw new Error(`"${control.label}" must be one of its options`);
        }
        break;
      case "switch":
        if (typeof value !== "boolean") throw new Error(`"${control.label}" must be on or off`);
        break;
    }
    values[control.id] = control.kind === "color" ? (value as string).toLowerCase() : value as string | number | boolean;
  }
  return values;
}

/** Hold durations keyed by marker id, as authored. */
export function authoredSegmentDurations(manifest: CompositionManifest): Record<string, number> {
  const byId = new Map(manifest.markers.map((marker) => [marker.id, marker]));
  const durations: Record<string, number> = {};
  for (const marker of manifest.markers) {
    // Microsecond rounding keeps 2.7 - 1.2 from hashing as 1.5000000000000002.
    if (marker.stretch && marker.until) {
      durations[marker.id] = Math.round((byId.get(marker.until)!.at_seconds - marker.at_seconds) * 1e6) / 1e6;
    }
  }
  return durations;
}

export type RuntimePayload = {
  controls: ManifestValues;
  segment_durations: Record<string, number>;
};

/** Script injected at the start of <head> in the render copy; the source is never modified. */
export function runtimeInjectionScript(payload: RuntimePayload): string {
  const json = JSON.stringify(payload).replaceAll("<", "\\u003c");
  return `<script>window.${RUNTIME_GLOBAL}=Object.freeze(${json});</script>`;
}

export function injectRuntimeIntoHtml(html: string, payload: RuntimePayload): string {
  const script = runtimeInjectionScript(payload);
  const head = /<head[^>]*>/i.exec(html);
  if (head) return `${html.slice(0, head.index + head[0].length)}${script}${html.slice(head.index + head[0].length)}`;
  const htmlTag = /<html[^>]*>/i.exec(html);
  if (htmlTag) return `${html.slice(0, htmlTag.index + htmlTag[0].length)}<head>${script}</head>${html.slice(htmlTag.index + htmlTag[0].length)}`;
  return `${script}${html}`;
}

export type SourceText = { path: string; text: string };

const ACTOR_ATTRIBUTE_RE = /data-actor\s*=\s*["']([^"']+)["']/g;
const REMOTE_REFERENCE_RE = /\b(?:src|href)\s*=\s*["'](https?:)?\/\/[^"']+["']|\b(?:fetch|import)\s*\(\s*["'`]https?:\/\//gi;

export function actorAttributeIds(sources: SourceText[]): Set<string> {
  const ids = new Set<string>();
  for (const source of sources) {
    for (const match of source.text.matchAll(ACTOR_ATTRIBUTE_RE)) ids.add(match[1]!);
  }
  return ids;
}

export type ManifestValidation = { errors: string[]; warnings: string[] };

/**
 * Static checks that gate correctness, never coverage. A declared control must be
 * read somewhere in the source. Remote resources are reported as warnings.
 */
export function validateCompositionSources(
  manifest: CompositionManifest | null,
  sources: SourceText[],
): ManifestValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const code = sources.filter((source) => /\.(?:html?|m?js|css)$/i.test(source.path));
  for (const source of code) {
    // Recorded, not blocked: the HyperFrames blank template itself loads GSAP from a CDN.
    if (REMOTE_REFERENCE_RE.test(source.text)) {
      warnings.push(`${source.path} loads a remote resource; renders depend on the network`);
    }
    REMOTE_REFERENCE_RE.lastIndex = 0;
  }
  if (!manifest) return { errors, warnings };

  const joined = code.map((source) => source.text).join("\n");
  if (manifest.controls.length > 0 && !joined.includes(RUNTIME_GLOBAL)) {
    errors.push(`Declared controls are never read; the composition must read window.${RUNTIME_GLOBAL}.controls`);
  }
  for (const control of manifest.controls) {
    const pattern = new RegExp(`["'.\\[]${control.id}\\b`);
    if (!pattern.test(joined)) errors.push(`Declared control "${control.id}" is not read by the composition`);
  }
  errors.push(...controlKindProblems(manifest.controls));
  const holds = manifest.markers.filter((marker) => marker.stretch);
  if (holds.length > 0 && !joined.includes("segment_durations")) {
    errors.push(`Declared holds are never read; the composition must read window.${RUNTIME_GLOBAL}.segment_durations`);
  }
  const tagged = actorAttributeIds(sources);
  for (const actor of manifest.actors) {
    if (!tagged.has(actor.id)) errors.push(`Declared actor "${actor.id}" has no element with data-actor="${actor.id}"`);
  }
  for (const id of tagged) {
    if (!manifest.actors.some((actor) => actor.id === id)) warnings.push(`data-actor="${id}" is not declared in the controls file`);
  }
  return { errors, warnings };
}

/**
 * Each control must use the family the editor-controls catalog gives its value
 * (docs/standards/editor-controls.md#choosing-the-family). A slider means "more or less of
 * something"; a whole number with a handful of positions and no unit almost always picks one
 * of a few things (which section, which layout), so it must be a choice the creator reads by
 * name. A count keeps `number` by declaring its unit ("items", "rows").
 */
export function controlKindProblems(controls: readonly ManifestControl[]): string[] {
  return controls.flatMap((control) => {
    if (control.kind !== "number" || control.unit) return [];
    const step = control.step ?? 0;
    const positions = step > 0 && Number.isInteger(step) && Number.isInteger(control.min) ? Math.floor((control.max - control.min) / step) + 1 : Infinity;
    return positions <= 8
      ? [`Control "${control.id}" (${control.label}) picks one of ${positions} positions: make it a choice whose options are named (label_from can name them after text controls), or give a count its unit`]
      : [];
  });
}

export function compositionCoverage(manifest: CompositionManifest | null, sources: SourceText[]): MotionAuditCoverage {
  const tagged = actorAttributeIds(sources);
  const declared = new Set((manifest?.actors ?? []).map((actor) => actor.id));
  return {
    has_manifest: manifest != null,
    declared_controls: manifest?.controls.length ?? 0,
    declared_actors: manifest?.actors.length ?? 0,
    declared_markers: manifest?.markers.length ?? 0,
    undeclared_actor_attributes: [...tagged].filter((id) => !declared.has(id)).length,
    missing_actor_attributes: [...declared].filter((id) => !tagged.has(id)).length,
  };
}
