/** Last-mile scrubbing for errors, logs and spans. Never attach project state. */
export function scrubText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s<>"']+/gi, "[url]")
    .replace(/(?:[A-Za-z]:\\|\/(?:Users|home|private|var|tmp|Volumes)\/)[^\s<>"']+/g, "[local-path]")
    .replace(/\/api\/(?:projects|trailers)\/[^/\s?]+/g, "/api/projects/[project]")
    .replace(/\/p\/[^/\s?]+/g, "/p/[project]")
    .replace(/\/media\/[^\s?]+/g, "/media/[asset]")
    .replace(/\?[^\s]+/g, "?[filtered]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b(?:Bearer\s+\S+|(?:sk|sk-ant|sntrys)_[\w-]+|sk-[\w-]+|gh[pousr]_[\w]+)\b/gi, "[credential]")
    .replace(/\b(?:token|password|secret|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi, "[credential]")
    .replace(/(["'`])[^\n]*?\1/g, "[quoted-value]")
    .slice(0, 2000);
}

const privateKey = /(?:authorization|cookie|password|secret|token|api.?key|transcript|prompt|completion|source_url|media|filename|file_path|project.?id|trailer.?id|element.?id|user|body|payload|attachment|argv|command|locals|vars|context_line|pre_context|post_context)/i;

export function scrubTelemetry<T>(value: T): T {
  const visit = (input: unknown, depth: number): unknown => {
    if (depth > 12) return "[depth-limit]";
    if (typeof input === "string") return scrubText(input);
    if (input == null || typeof input === "number" || typeof input === "boolean") return input;
    if (Array.isArray(input)) return input.slice(0, 200).map((item) => visit(item, depth + 1));
    if (typeof input !== "object") return undefined;
    return Object.fromEntries(Object.entries(input).filter(([key]) => !privateKey.test(key))
      .map(([key, item]) => [key, visit(item, depth + 1)]));
  };
  return visit(value, 0) as T;
}

export function scrubEvent<T extends { request?: unknown; extra?: unknown; breadcrumbs?: unknown; contexts?: unknown }>(event: T): T {
  // Request and arbitrary application context can contain entire timelines or source text.
  const result = { ...event };
  delete result.request;
  delete result.extra;
  delete result.breadcrumbs;
  if (result.contexts && typeof result.contexts === "object") {
    result.contexts = Object.fromEntries(Object.entries(result.contexts).filter(([key]) => ["trace", "runtime", "browser", "os"].includes(key)));
  }
  return scrubTelemetry(result);
}
