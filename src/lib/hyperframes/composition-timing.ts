/**
 * A composition's declared timing: its length and named cues (moments such as "title lands")
 * as small arithmetic formulas over its number controls, e.g. "2.2 * pace" or
 * "4.2 * pace + title_hold". DreamCut evaluates them for any value set without rendering, so
 * linked sounds can follow a cue and the clip can follow the length when a creator turns a
 * timing knob. The composition's own code must place the same moments at the same times.
 */
export type TimingCue = { id: string; label: string; at: string };
export type CompositionTimingSpec = { duration?: string; cues: TimingCue[] };
export type ResolvedTiming = { duration: number | null; cues: Record<string, number> };

const ID_RE = /^[a-z][a-z0-9_]{0,47}$/;
const FORMULA_RE = /^[a-z0-9_.+\-*/()\s,]{1,200}$/;
const FUNCTIONS: Record<string, (...args: number[]) => number> = { min: Math.min, max: Math.max };

/** Evaluates + - * / ( ) min() max() over numbers and the given variables. Throws on anything else. */
export function evaluateFormula(formula: string, variables: Record<string, number>): number {
  if (!FORMULA_RE.test(formula)) throw new Error(`Timing formula "${formula}" may use numbers, control ids, + - * / ( ) and min/max only`);
  const tokens = formula.match(/\d+(?:\.\d+)?|[a-z_][a-z0-9_]*|[+\-*/(),]/g) ?? [];
  let index = 0;
  const peek = () => tokens[index], next = () => tokens[index++];
  const expression = (): number => { let value = term(); while (peek() === "+" || peek() === "-") value = next() === "+" ? value + term() : value - term(); return value; };
  const term = (): number => { let value = factor(); while (peek() === "*" || peek() === "/") { const op = next(), right = factor(); value = op === "*" ? value * right : value / right; } return value; };
  const factor = (): number => {
    const token = next();
    if (token === undefined) throw new Error(`Timing formula "${formula}" ends early`);
    if (token === "-") return -factor();
    if (token === "(") { const value = expression(); if (next() !== ")") throw new Error(`Timing formula "${formula}" is missing )`); return value; }
    if (/^\d/.test(token)) return Number(token);
    if (FUNCTIONS[token]) {
      if (next() !== "(") throw new Error(`Timing formula "${formula}": ${token} needs (`);
      const args = [expression()];
      while (peek() === ",") { next(); args.push(expression()); }
      if (next() !== ")") throw new Error(`Timing formula "${formula}" is missing )`);
      return FUNCTIONS[token](...args);
    }
    if (token in variables) return variables[token];
    throw new Error(`Timing formula "${formula}" uses "${token}", which is not a number control`);
  };
  const value = expression();
  if (index !== tokens.length) throw new Error(`Timing formula "${formula}" has extra text`);
  if (!Number.isFinite(value)) throw new Error(`Timing formula "${formula}" is not a finite number`);
  return value;
}

/** Parse the optional `timing` block of dreamcut.controls.json. `numbers` are the number controls' defaults. */
export function parseTimingSpec(raw: unknown, numbers: Record<string, number>): CompositionTimingSpec | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Animation controls file: timing must be an object");
  const spec = raw as Record<string, unknown>;
  const duration = spec.duration === undefined ? undefined : String(spec.duration);
  if (!Array.isArray(spec.cues ?? [])) throw new Error("Animation controls file: timing.cues must be a list");
  const cues = ((spec.cues ?? []) as unknown[]).map((value, index) => {
    const cue = value as Record<string, unknown>;
    if (!cue || typeof cue.id !== "string" || !ID_RE.test(cue.id)) throw new Error(`Animation controls file: cue ${index + 1} needs a snake_case id`);
    if (typeof cue.label !== "string" || !cue.label.trim() || cue.label.length > 60) throw new Error(`Animation controls file: cue "${cue.id}" needs a short label`);
    return { id: cue.id, label: cue.label, at: String(cue.at) };
  });
  if (new Set(cues.map(cue => cue.id)).size !== cues.length) throw new Error("Animation controls file: cue ids must be unique");
  const parsed = { ...(duration ? { duration } : {}), cues };
  resolveTiming(parsed, numbers); // Fails now, not at render, if a formula is wrong.
  return parsed;
}

/** Cue times and length for one value set. Only number values reach the formulas. */
export function resolveTiming(spec: CompositionTimingSpec, values: Record<string, unknown>): ResolvedTiming {
  const numbers = Object.fromEntries(Object.entries(values).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
  const round = (seconds: number) => Math.round(seconds * 1e4) / 1e4;
  const cues = Object.fromEntries(spec.cues.map(cue => [cue.id, round(Math.max(0, evaluateFormula(cue.at, numbers)))]));
  const duration = spec.duration ? round(evaluateFormula(spec.duration, numbers)) : null;
  if (duration !== null && !(duration > 0)) throw new Error(`Timing duration "${spec.duration}" must be longer than zero`);
  return { duration, cues };
}
